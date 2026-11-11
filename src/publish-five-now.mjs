import { readFile, writeFile } from "node:fs/promises";
import config from "../config.json" with { type:"json" };
import state from "../state.json" with { type:"json" };
import { nextPointer } from "./quran.mjs";
import { resolveXChannel } from "./buffer.mjs";

const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
if(day!=="2026-11-11")throw Error("Test uniquement le 11 novembre, aucune publication.");
if(config.targetHandle!=="alQamarDaily")throw Error("Mauvais compte X");
if(state.nextVerse.surah!==1 || state.nextVerse.verse!==2)throw Error("Versets déjà avancés, envoi annulé.");
const manifest=JSON.parse(await readFile("public/test-five/2026-11-11/manifest.json","utf8"));
const expected=["1:2","1:3","1:4","1:5","1:6"];
if(manifest.posts.length!==5 || expected.some((e,i)=>manifest.posts[i].reference!==e))throw Error("Manifest des cinq versets incohérent");
const token=process.env.BUFFER_API_TOKEN;
if(!token)throw Error("BUFFER_API_TOKEN indisponible");
const channel=await resolveXChannel(token,config.targetHandle);
if(channel.isQueuePaused)throw Error("La file du compte X est suspendue");

async function query(query,variables={}){
 const r=await fetch("https://api.buffer.com",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({query,variables})});
 const data=await r.json();
 if(!r.ok || data.errors?.length)throw Error(`Buffer GraphQL : ${data.errors?.map(x=>x.message).join("; ")||r.status}`);
 return data.data;
}
const postsQuery=`query($organizationId: OrganizationId!, $channelIds: [ChannelId!]) {
 posts(first: 100,input:{organizationId:$organizationId,filter:{status:[scheduled,sent],channelIds:$channelIds}}) {
  edges {node{id text status externalLink}} pageInfo{hasNextPage}
 }
}`;
const recent=await query(postsQuery,{organizationId:channel.organizationId,channelIds:[channel.id]});
if(recent.posts.pageInfo.hasNextPage)throw Error("Liste Buffer incomplète; impossible d'exclure les doublons");
const existing=new Map(recent.posts.edges.map(x=>[x.node.text,x.node]));
const out=[];
for(const p of manifest.posts){
 const caption=`Al Fatiha ${p.reference}`;
 if(p.caption!==caption)throw Error("Légende incorrecte pour "+p.reference);
 if(existing.has(caption)){
   const prev=existing.get(caption);
   if(prev.status==="sent"){console.log("DÉJÀ PUBLIÉ",caption,prev.externalLink);out.push({reference:p.reference,id:prev.id,url:prev.externalLink,alreadySent:true});continue;}
   throw Error(`Publication déjà programmée pour ${caption}, aucun doublon créé`);
 }
 const imageUrl=`https://raw.githubusercontent.com/${config.publicRepository}/main/public/test-five/2026-11-11/${p.filename}`;
 const image=await fetch(imageUrl,{method:"HEAD"});
 if(!image.ok || !image.headers.get("content-type")?.startsWith("image/"))throw Error(`Image non accessible pour ${caption}: ${image.status}`);
 const assets=[{image:{url:imageUrl,metadata:{altText:p.altText}}}];
 const created=await query(`mutation($input:CreatePostInput!){
  createPost(input:$input){... on PostActionSuccess{post{id status}} ... on MutationError{message}}
 }`,{input:{channelId:channel.id,text:caption,mode:"addToQueue",schedulingType:"automatic",saveToDraft:true,assets}});
 const draft=created.createPost;
 if(!draft?.post?.id)throw Error(`Brouillon refusé: ${draft?.message||"inconnu"}`);
 const id=draft.post.id;
 const response=await query(`mutation($input:EditPostInput!){
  editPost(input:$input){... on PostActionSuccess{post{id status}} ... on MutationError{message}}
 }`,{input:{id,mode:"shareNow",text:caption,assets}});
 if(response?.editPost?.post?.id!==id)throw Error(`Envoi immédiat refusé pour ${caption} ; brouillon Buffer ${id}: ${response?.editPost?.message||"inconnu"}`);
 let published=null;
 for(let attempts=0;attempts<12;attempts++){
  const got=await query(`query($input:PostInput!){post(input:$input){id status externalLink sentAt error{message}}}`,{input:{id}});
  if(got.post.status==="sent"){published=got.post;break;}
  if(got.post.status==="error")throw Error(`Publication X refusée ${caption}: ${got.post.error?.message||"erreur inconnue"}`);
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
 if(!published?.externalLink)throw Error(`Publication ${caption} pas encore confirmée sur X; Buffer ID ${id}`);
 console.log("PUBLIÉ",caption,published.externalLink);
 out.push({reference:p.reference,id,url:published.externalLink,alreadySent:false});
 existing.set(caption,{id,text:caption,status:"sent",externalLink:published.externalLink});
}
if(out.length!==5)throw Error("Cinq résultats attendus");
const after={nextVerse:nextPointer({surah:1,verse:6}),lastCompletedDate:day,lastBufferPostId:out.at(-1).id,lastTestPublications:out};
await writeFile("state.json",JSON.stringify(after,null,2)+"\n");
await writeFile("public/test-five/2026-11-11/publication-results.json",JSON.stringify(out,null,2)+"\n");
console.log("CINQ TWEETS CONFIRMÉS SUR X, PROCHAIN VERSET 1:7");

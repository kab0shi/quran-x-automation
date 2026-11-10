import { readFile } from "node:fs/promises";
import config from "../config.json" with { type: "json" };
import { resolveXChannel } from "./buffer.mjs";

const token = process.env.BUFFER_API_TOKEN;
if (!token) throw new Error("BUFFER_API_TOKEN absent");
const channel = await resolveXChannel(token, config.targetHandle);
const manifest = JSON.parse(await readFile(new URL("../public/previews/manifest.json", import.meta.url), "utf8"));
if (manifest.length !== 10) throw new Error("Le test nécessite 10 cartes de versets");
const thread = manifest.map(p => ({
  text: p.caption,
  assets: [{ image: {
    url: `https://raw.githubusercontent.com/${config.publicRepository}/main/public/previews/${p.filename}`,
    metadata: { altText: p.altText }
  }}]
}));
async function request(query, variables) {
  const response = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) throw new Error(`Buffer GraphQL: ${result.errors?.map(x=>x.message).join("; ") || response.status}`);
  return result.data;
}
const data = await request(`
  mutation Draft($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id status } }
      ... on MutationError { message }
    }
  }
`, { input: {
  channelId: channel.id,
  schedulingType: "automatic",
  mode: "addToQueue",
  saveToDraft: true,
  text: thread[0].text,
  metadata: { twitter: { thread } }
} });
if (!data?.createPost?.post?.id) throw new Error(`Fil brouillon Buffer refusé : ${data?.createPost?.message || "réponse inconnue"}`);
const id = data.createPost.post.id;
console.log("Structure de fil de 10 images acceptée par Buffer en BROUILLON, sans publication.");
const removed = await request(`
  mutation Delete($input: DeletePostInput!) {
    deletePost(input: $input) {
      ... on DeletePostSuccess { id }
      ... on VoidMutationError { message }
    }
  }
`, { input: { id } });
if (removed?.deletePost?.id !== id) throw new Error(`Brouillon temporaire ${id} non supprimé : ${removed?.deletePost?.message || "réponse inconnue"}`);
console.log("Brouillon d'essai supprimé. Publication réelle non affectée.");

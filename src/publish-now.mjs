import state from "../state.json" with { type: "json" };
import config from "../config.json" with { type: "json" };
import manifest from "../public/previews/manifest.json" with { type: "json" };
import { listScheduledPosts, resolveXChannel } from "./buffer.mjs";

const todayParis = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
if (todayParis !== "2026-11-10") throw new Error("Ce test ponctuel n'est autorisé que le 10 novembre 2026.");
const token = process.env.BUFFER_API_TOKEN;
if (!token) throw new Error("BUFFER_API_TOKEN manquant");
const id = state.lastBufferPostId;
if (id !== "6af3303d825741bba83c7d27") throw new Error("L'identifiant prévu du premier tweet a changé.");
if (config.targetHandle !== "alQamarDaily") throw new Error("Le mauvais compte X serait ciblé.");

const first = manifest.find(item => item.reference === "1:1");
if (!first || first.lunarIlluminationPercent > 5) throw new Error("Aperçu lunar 1:1 incorrect");
const img = `https://raw.githubusercontent.com/${config.publicRepository}/${process.env.GITHUB_SHA || "main"}/public/previews/${first.filename}`;
const file = await fetch(img, { method: "HEAD", cache: "no-store" });
if (!file.ok || !file.headers.get("content-type")?.startsWith("image/")) {
  throw new Error(`Image publique non disponible : ${file.status}`);
}
const channel = await resolveXChannel(token, config.targetHandle);
if (channel.isQueuePaused) throw new Error("La publication X est en pause");
const queue = await listScheduledPosts(token, channel.organizationId, channel.id);
const original = queue.find(p => p.id === id && p.text === first.caption);
if (!original) throw new Error("Le premier verset n'est plus en file d'attente : on ne crée aucun doublon.");
async function edit(input) {
  const query = `mutation($input: EditPostInput!) {
    editPost(input: $input) {
      ... on PostActionSuccess { post { id status dueAt text } }
      ... on MutationError { message }
    }
  }`;
  const response = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { input } })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) throw new Error(`Buffer GraphQL: ${payload.errors?.map(x=>x.message).join("; ") || response.status}`);
  const result = payload.data?.editPost;
  if (!result?.post?.id) throw new Error(`Buffer editPost refusé : ${result?.message || "réponse inconnue"}`);
  if (result.post.id !== id) throw new Error("Buffer a répondu avec un mauvais identifiant.");
  return result.post;
}
await edit({ id, assets: [{ image: { url: img, metadata: { altText: first.altText } } }] });
console.log("L'image a été remplacée sur le tweet déjà programmé.");
const posted = await edit({ id, mode: "shareNow", text: first.caption, assets: [{ image: { url: img, metadata: { altText: first.altText } } }] });
console.log(`ENVOI IMMÉDIAT DEMANDÉ : post Buffer ${posted.id}, statut ${posted.status}, date ${posted.dueAt || "non spécifiée"}`);

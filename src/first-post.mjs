import { readFile, writeFile } from "node:fs/promises";
import config from "../config.json" with { type: "json" };
import { createScheduledImagePost, listScheduledPosts, resolveXChannel } from "./buffer.mjs";

const date = "2026-11-10";
const dueAt = "2026-11-10T17:00:00.000Z"; // 18h Europe/Paris, winter time
const currentDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
if (currentDate !== date || Date.now() > Date.parse(dueAt) - 120_000) {
  throw new Error("Test valable uniquement avant 17:58 UTC le 10 novembre 2026 ; aucune publication envoyée.");
}
const token = process.env.BUFFER_API_TOKEN;
if (!token) throw new Error("BUFFER_API_TOKEN absent");
const manifest = JSON.parse(await readFile(new URL("../public/previews/manifest.json", import.meta.url), "utf8"));
const first = manifest.find((item) => item.reference === "1:1");
if (!first || first.lunarIlluminationPercent > 5) throw new Error("Le premier visuel lunaire est manquant ou obsolète");
const imageUrl = `https://raw.githubusercontent.com/${config.publicRepository}/main/public/previews/${first.filename}`;
const response = await fetch(imageUrl, { method: "HEAD" });
if (!response.ok || !response.headers.get("content-type")?.includes("image")) {
  throw new Error(`Image non publique : ${response.status} ${response.headers.get("content-type")}`);
}
const channel = await resolveXChannel(token, config.targetHandle);
if (channel.isQueuePaused) throw new Error("Canal X en pause : test annulé.");
const queue = await listScheduledPosts(token, channel.organizationId, channel.id);
const duplicate = queue.find((p) => p.text === first.caption && p.dueAt && new Date(p.dueAt).toISOString() === dueAt);
const post = duplicate || await createScheduledImagePost(token, {
  channelId: channel.id,
  text: first.caption,
  dueAt,
  imageUrl,
  altText: first.altText
});
if (!post?.id) throw new Error("Buffer n'a pas confirmé la programmation du tweet.");
await writeFile(new URL("../state.json", import.meta.url), JSON.stringify({
  nextVerse: { surah: 1, verse: 2 },
  lastCompletedDate: date,
  lastBufferPostId: post.id
}, null, 2) + "\n");
console.log(`${duplicate ? "Déjà programmé" : "TEST PROGRAMMÉ"} : @${config.targetHandle} pour 18:00 Europe/Paris le ${date} ; Buffer ${post.id}`);

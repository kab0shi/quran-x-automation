import { readFile } from "node:fs/promises";
import config from "../config.json" with { type: "json" };
import { createScheduledImagePost, listScheduledPosts, resolveXChannel } from "./buffer.mjs";

const token = process.env.BUFFER_API_TOKEN;
if (!token) throw new Error("Secret BUFFER_API_TOKEN absent");

const manifest = JSON.parse(await readFile(new URL("../public/previews/manifest.json", import.meta.url), "utf8"));
const preview = manifest.find((item) => item.reference === "1:1");
if (!preview) throw new Error("Aperçu 1:1 introuvable");

const channel = await resolveXChannel(token, config.targetHandle);
const scheduled = await listScheduledPosts(token, channel.organizationId, channel.id);
if (scheduled.some((post) => post.text === preview.caption)) {
  console.log("Le tweet test 1:1 est déjà programmé.");
  process.exit(0);
}

const dueAt = new Date(Date.now() + 2 * 60_000).toISOString();
const imageUrl = `https://raw.githubusercontent.com/${config.publicRepository}/main/public/previews/${preview.filename}`;
const post = await createScheduledImagePost(token, {
  channelId: channel.id,
  text: preview.caption,
  dueAt,
  imageUrl,
  altText: preview.altText
});
console.log(`Tweet test programmé pour ${dueAt} (Buffer ${post?.id ?? "sans identifiant"}).`);

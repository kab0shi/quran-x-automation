import config from "../config.json" with { type: "json" };
import { resolveXChannel, listScheduledPosts } from "./buffer.mjs";

const token = process.env.BUFFER_API_TOKEN;
if (!token) throw new Error("Le secret BUFFER_API_TOKEN n'est pas configuré dans GitHub Actions.");

const channel = await resolveXChannel(token, config.targetHandle);
if (channel.isQueuePaused) {
  throw new Error(`Le canal @${config.targetHandle} est en pause dans Buffer.`);
}
const scheduled = await listScheduledPosts(token, channel.organizationId, channel.id);
console.log(`Connexion Buffer vérifiée pour @${config.targetHandle} : ${scheduled.length} publication(s) programmée(s).`);
console.log("Lecture seule : aucune publication n'a été créée ni programmée.");

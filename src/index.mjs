import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join } from "node:path";
import config from "../config.json" with { type: "json" };
import state from "../state.json" with { type: "json" };
import { altTextFor, captionFor } from "./format.mjs";
import { fetchVerseBundle, takePointers } from "./quran.mjs";
import { renderVerse } from "./render.mjs";
import { createScheduledThreadPost, listScheduledPosts, resolveXChannel } from "./buffer.mjs";

const command = process.argv[2] || "preview";
const useFixture = process.argv.includes("--fixture");

function localDate(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function zonedDueAt(date, time, timezone) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    guess -= shown - desired;
  }
  return new Date(guess).toISOString();
}

async function loadBundles() {
  const { pointers, next } = takePointers(state.nextVerse || config.start, config.postsPerDay);
  if (useFixture) {
    const fixture = JSON.parse(await readFile(new URL("../test/fixtures/al-fatiha.json", import.meta.url), "utf8"));
    return { bundles: fixture.slice(0, config.postsPerDay), next };
  }
  return { bundles: await Promise.all(pointers.map(fetchVerseBundle)), next };
}

async function capturesFor(bundles, directory) {
  if (useFixture) {
    return new Map(bundles.map((bundle) => {
      const reference = `${bundle.surah}:${bundle.verse}`;
      return [reference, {
        path: new URL(`../test/fixtures/quran-source/${bundle.surah}-${bundle.verse}.jpg`, import.meta.url).pathname,
        rect: reference === "1:1"
          ? { left: 200, top: 0, width: 478, height: 216 }
          : { left: 84, top: 215, width: 678, height: 100 }
      }];
    }));
  }
  const { captureQuranVerses } = await import("./quran-screenshot.mjs");
  return captureQuranVerses(
    bundles.map(({ surah, verse }) => ({ surah, verse })),
    join(directory, "quran-source")
  );
}

async function generateImages(bundles, directory, publicationDate = localDate(config.timezone)) {
  const publishAt = new Date(zonedDueAt(publicationDate, config.publishTime || "18:00", config.timezone));
  await mkdir(directory, { recursive: true });
  const captures = await capturesFor(bundles, directory);
  const outputs = [];
  for (const bundle of bundles) {
    const filename = `${bundle.surah}-${bundle.verse}.png`;
    const outputPath = join(directory, filename);
    const capture = captures.get(`${bundle.surah}:${bundle.verse}`);
    const { moon } = await renderVerse(bundle, outputPath, config.sources, capture, publishAt);
    outputs.push({
      moon,
      bundle,
      filename,
      outputPath,
      caption: captionFor(bundle, config.hashtags),
      altText: altTextFor(bundle, config.sources)
    });
  }
  return outputs;
}

async function preview() {
  const { bundles } = await loadBundles();
  const outputDirectory = new URL("../public/previews/", import.meta.url).pathname;
  const outputs = await generateImages(bundles, outputDirectory);
  const manifest = outputs.map(({ bundle, filename, caption, altText }) => ({
    reference: `${bundle.surah}:${bundle.verse}`,
    lunarIlluminationPercent: Math.round((outputs.find(o => o.filename === filename)?.moon.illuminated ?? 0) * 100),
    filename,
    caption,
    altText
  }));
  await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Aperçu créé : ${outputs.length} images dans public/previews/`);
}

async function waitUntilPublic(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Image publique inaccessible : ${url}`);
}

async function schedule() {
  const date = localDate(config.timezone);
  if (config.dailyStartDate && date < config.dailyStartDate) {
    console.log(`Programmation quotidienne prévue à partir du ${config.dailyStartDate}, aucune action aujourd'hui.`);
    return;
  }
  if (state.lastCompletedDate === date) {
    console.log(`Déjà programmé pour ${date} ; pas de doublon.`);
    return;
  }

  const dueAt = zonedDueAt(date, config.publishTime || "18:00", config.timezone);
  if (Date.now() >= new Date(dueAt).getTime() - 2*60_000) {
    throw new Error(`Trop tard pour programmer le fil de ${date} à 18 h (Europe/Paris) : aucune publication lancée en retard.`);
  }
  const directory = new URL(`../public/posts/${date}/`, import.meta.url).pathname;
  const manifestPath = join(directory, "manifest.json");

  if (process.env.IMAGES_COMMITTED !== "true") {
    const { bundles, next } = await loadBundles();
    if (bundles.length !== config.postsPerDay) throw new Error("Nombre de versets incomplet");
    const outputs = await generateImages(bundles, directory, date);
    await writeFile(manifestPath, JSON.stringify({
      date, dueAt, next,
      posts: outputs.map((item) => ({
        filename: item.filename,
        reference: `${item.bundle.surah}:${item.bundle.verse}`,
        caption: item.caption,
        altText: item.altText,
        lunarIlluminationPercent: item.moon.percent
      }))
    }, null, 2) + "\n");
    console.log(`Images du ${date} préparées. Aucun tweet créé à cette étape.`);
    return;
  }

  const token = process.env.BUFFER_API_TOKEN;
  if (!token) throw new Error("Secret BUFFER_API_TOKEN absent");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.date !== date || manifest.dueAt !== dueAt || manifest.posts.length !== config.postsPerDay) {
    throw new Error("Manifest quotidien incohérent");
  }
  const posts = manifest.posts.map((item) => ({
    text: item.caption,
    altText: item.altText,
    imageUrl: `https://raw.githubusercontent.com/${config.publicRepository}/main/public/posts/${date}/${item.filename}`
  }));
  for (const post of posts) await waitUntilPublic(post.imageUrl);
  const channel = await resolveXChannel(token, config.targetHandle);
  if (channel.isQueuePaused) throw new Error("Canal X en pause dans Buffer");
  const queue = await listScheduledPosts(token, channel.organizationId, channel.id);
  const duplicate = queue.find((item) => item.text === posts[0].text && item.dueAt && new Date(item.dueAt).toISOString() === dueAt);
  const post = duplicate || await createScheduledThreadPost(token, { channelId: channel.id, dueAt, posts });
  await writeFile(new URL("../state.json", import.meta.url), JSON.stringify({
    nextVerse: manifest.next, lastCompletedDate: date, lastBufferPostId: post.id
  }, null, 2) + "\n", "utf8");
  console.log(`${duplicate ? "Déjà programmé" : "Fil de 10 ayat programmé"} : @${config.targetHandle}, ${date} 18:00 Paris (Buffer ${post.id}).`);
}

if (command === "preview") await preview();
else if (command === "schedule") await schedule();
else throw new Error(`Commande inconnue : ${command}`);

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join } from "node:path";
import config from "../config.json" with { type: "json" };
import state from "../state.json" with { type: "json" };
import { altTextFor, captionFor } from "./format.mjs";
import { fetchVerseBundle, takePointers } from "./quran.mjs";
import { renderVerse } from "./render.mjs";
import { createScheduledImagePost, listScheduledPosts, resolveXChannel } from "./buffer.mjs";

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
    return new Map(bundles.map((bundle) => [
      `${bundle.surah}:${bundle.verse}`,
      {
        path: new URL(`../test/fixtures/quran-source/${bundle.surah}-${bundle.verse}.jpg`, import.meta.url).pathname,
        rect: { left: 84, top: 215, width: 678, height: 100 }
      }
    ]));
  }
  const { captureQuranVerses } = await import("./quran-screenshot.mjs");
  return captureQuranVerses(
    bundles.map(({ surah, verse }) => ({ surah, verse })),
    join(directory, "quran-source")
  );
}

async function generateImages(bundles, directory) {
  await mkdir(directory, { recursive: true });
  const captures = await capturesFor(bundles, directory);
  const outputs = [];
  for (const bundle of bundles) {
    const filename = `${bundle.surah}-${bundle.verse}.png`;
    const outputPath = join(directory, filename);
    const capture = captures.get(`${bundle.surah}:${bundle.verse}`);
    await renderVerse(bundle, outputPath, config.sources, capture);
    outputs.push({
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
  const token = process.env.BUFFER_API_TOKEN;
  if (!token) throw new Error("Secret BUFFER_API_TOKEN absent");
  if (config.times.length !== config.postsPerDay) throw new Error("Le nombre d'horaires ne correspond pas au nombre de publications");

  const date = localDate(config.timezone);
  const { bundles, next } = await loadBundles();
  const directory = new URL(`../public/posts/${date}/`, import.meta.url).pathname;
  const outputs = await generateImages(bundles, directory);

  if (process.env.IMAGES_COMMITTED !== "true") {
    console.log("Images générées. Elles doivent être commit/push avant la programmation Buffer.");
    return;
  }

  const channel = await resolveXChannel(token, config.targetHandle);
  const scheduled = await listScheduledPosts(token, channel.organizationId, channel.id);

  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    const dueAt = zonedDueAt(date, config.times[index], config.timezone);
    const imageUrl = `https://raw.githubusercontent.com/${config.publicRepository}/main/public/posts/${date}/${basename(output.outputPath)}`;
    const alreadyExists = scheduled.some((post) => post.text === output.caption && new Date(post.dueAt).toISOString() === dueAt);
    if (alreadyExists) {
      console.log(`Déjà programmé : ${output.bundle.surah}:${output.bundle.verse}`);
      continue;
    }
    await waitUntilPublic(imageUrl);
    await createScheduledImagePost(token, {
      channelId: channel.id,
      text: output.caption,
      dueAt,
      imageUrl,
      altText: output.altText
    });
    console.log(`Programmé : ${output.bundle.surah}:${output.bundle.verse} à ${dueAt}`);
  }

  await access(directory, constants.R_OK);
  await writeFile(new URL("../state.json", import.meta.url), `${JSON.stringify({ nextVerse: next, lastCompletedDate: date }, null, 2)}\n`, "utf8");
}

if (command === "preview") await preview();
else if (command === "schedule") await schedule();
else throw new Error(`Commande inconnue : ${command}`);

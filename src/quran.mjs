import { EDITIONS, SURAH_NAMES, VERSE_COUNTS } from "./constants.mjs";
import { cleanText } from "./format.mjs";

export function validatePointer(pointer) {
  const { surah, verse } = pointer;
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error(`Sourate invalide : ${surah}`);
  if (!Number.isInteger(verse) || verse < 1 || verse > VERSE_COUNTS[surah - 1]) {
    throw new Error(`Verset invalide : ${surah}:${verse}`);
  }
  return pointer;
}

export function nextPointer(pointer) {
  validatePointer(pointer);
  if (pointer.verse < VERSE_COUNTS[pointer.surah - 1]) {
    return { surah: pointer.surah, verse: pointer.verse + 1 };
  }
  if (pointer.surah === 114) return { surah: 1, verse: 1 };
  return { surah: pointer.surah + 1, verse: 1 };
}

export function takePointers(start, count) {
  const pointers = [];
  let current = validatePointer({ ...start });
  for (let index = 0; index < count; index += 1) {
    pointers.push(current);
    current = nextPointer(current);
  }
  return { pointers, next: current };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "quran-x-automation/1.0" } });
  if (!response.ok) throw new Error(`${response.status} pour ${url}`);
  return response.json();
}

// Quran API verse endpoints return a verse object, not { chapter: [verse] }.
// Accept the older nested format too, but always validate the exact reference.
export function parseEditionResponse(payload, edition, surah, verse) {
  const item = Array.isArray(payload?.chapter)
    ? payload.chapter.find((candidate) => Number(candidate?.chapter) === surah && Number(candidate?.verse) === verse)
    : payload;
  if (Number(item?.chapter) !== surah || Number(item?.verse) !== verse || typeof item?.text !== "string" || !cleanText(item.text)) {
    throw new Error(`Réponse incohérente pour ${edition} ${surah}:${verse} (champs reçus : ${Object.keys(payload ?? {}).join(", ")})`);
  }
  return cleanText(item.text);
}

async function fetchEdition(edition, surah, verse) {
  const path = `editions/${edition}/${surah}/${verse}.json`;
  const urls = [
    `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/${path}`,
    `https://raw.githubusercontent.com/fawazahmed0/quran-api/1/${path}`
  ];
  let lastError;
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      return parseEditionResponse(data, edition, surah, verse);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// QuranEnc keeps the Montada translation separate from explanatory footnotes.
// Fawaz's flattened French file can inadvertently append a footnote fragment.
export function parseMontadaResponse(payload, surah, verse) {
  const item = payload?.result;
  if (Number(item?.sura) !== surah || Number(item?.aya) !== verse || typeof item?.translation !== "string") {
    throw new Error(`QuranEnc : réponse incohérente pour ${surah}:${verse}`);
  }
  const text = cleanText(item.translation).replace(new RegExp(`^(?:\\(${verse}\\)|${verse}[.)])\\s*`), "");
  if (!text) throw new Error(`QuranEnc : traduction Montada vide pour ${surah}:${verse}`);
  return text;
}

async function fetchMontada(surah, verse) {
  const url = `https://quranenc.com/api/v1/translation/aya/french_montada/${surah}/${verse}?without_footnotes_symbols=1`;
  return parseMontadaResponse(await fetchJson(url), surah, verse);
}

export async function fetchVerseBundle(pointer) {
  validatePointer(pointer);
  const keys = Object.keys(EDITIONS);
  const texts = await Promise.all(keys.map((key) => key === "french"
    ? fetchMontada(pointer.surah, pointer.verse)
    : fetchEdition(EDITIONS[key], pointer.surah, pointer.verse)));
  return {
    surah: pointer.surah,
    verse: pointer.verse,
    surahName: SURAH_NAMES[pointer.surah - 1],
    ...Object.fromEntries(keys.map((key, index) => [key, texts[index]]))
  };
}

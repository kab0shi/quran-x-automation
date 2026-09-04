export function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeXml(value) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapText(text, maxCharacters) {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function referenceFor(bundle) {
  return `${bundle.surahName} — ${bundle.surah}:${bundle.verse}`;
}

export function captionFor(bundle, hashtags) {
  return `Sourate ${bundle.surahName} — Verset ${bundle.verse} (${bundle.surah}:${bundle.verse})\n\n${hashtags.map((tag) => `#${tag}`).join(" ")}`;
}

export function altTextFor(bundle, sources) {
  const alt = [
    `Sourate ${bundle.surahName}, verset ${bundle.verse} (${bundle.surah}:${bundle.verse}).`,
    `Arabe : ${cleanText(bundle.arabic)}.`,
    `Translittération : ${cleanText(bundle.transliteration)}.`,
    `Anglais : ${cleanText(bundle.english)}.`,
    `Français : ${cleanText(bundle.french)}.`,
    `Turc : ${cleanText(bundle.turkish)}.`,
    `Sources : arabe ${sources.arabic}, translittération ${sources.transliteration}, anglais ${sources.english}, français ${sources.french}, turc ${sources.turkish}.`
  ].join(" ");
  if (alt.length > 1000) throw new Error(`Texte alternatif trop long (${alt.length} caractères)`);
  return alt;
}

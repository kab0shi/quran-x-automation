import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { escapeXml, wrapText } from "./format.mjs";

const WIDTH = 1200;
const HEIGHT = 1500;

function lineMarkup(lines, x, y, options = {}) {
  const {
    fontSize = 40,
    lineHeight = Math.round(fontSize * 1.35),
    fill = "#f2f0e8",
    weight = 400,
    anchor = "start",
    family = "Noto Sans, Arial, sans-serif",
    direction = "ltr",
    letterSpacing = 0
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}" direction="${direction}" letter-spacing="${letterSpacing}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function gbFlag(x, y) {
  return `<g opacity=".72" transform="translate(${x} ${y})"><clipPath id="gb"><rect width="40" height="28" rx="3"/></clipPath><g clip-path="url(#gb)"><rect width="40" height="28" fill="#243b74"/><path d="M0 0L40 28M40 0L0 28" stroke="#f3eee2" stroke-width="7"/><path d="M0 0L40 28M40 0L0 28" stroke="#9a3a3a" stroke-width="3"/><path d="M20 0V28M0 14H40" stroke="#f3eee2" stroke-width="9"/><path d="M20 0V28M0 14H40" stroke="#9a3a3a" stroke-width="5"/></g></g>`;
}

function frFlag(x, y) {
  return `<g opacity=".72" transform="translate(${x} ${y})"><clipPath id="fr"><rect width="40" height="28" rx="3"/></clipPath><g clip-path="url(#fr)"><rect width="14" height="28" fill="#24447e"/><rect x="14" width="13" height="28" fill="#eeeae0"/><rect x="27" width="13" height="28" fill="#9b3c42"/></g></g>`;
}

function trFlag(x, y) {
  return `<g opacity=".72" transform="translate(${x} ${y})"><rect width="40" height="28" rx="3" fill="#963a3f"/><circle cx="17" cy="14" r="8" fill="#eeeae0"/><circle cx="20" cy="14" r="6.5" fill="#963a3f"/><path d="M27 9.5l1.35 3.1 3.35.25-2.55 2.2.8 3.25-2.95-1.75-2.85 1.75.72-3.25-2.48-2.2 3.35-.25z" fill="#eeeae0"/></g>`;
}

function translationBlock({ language, text, y, flag }) {
  const lines = wrapText(text, 47);
  if (lines.length > 3) throw new Error(`${language} occupe ${lines.length} lignes : image refusée pour préserver la lisibilité`);
  const labelY = y;
  const textY = y + 58;
  const bottom = textY + (lines.length - 1) * 55 + 24;
  return {
    bottom,
    svg: `<rect x="78" y="${y - 25}" width="1044" height="${bottom - y + 54}" rx="20" fill="#ffffff" opacity=".025" stroke="#c8b989" stroke-opacity=".12"/>
      ${flag(105, y - 3)}
      <text x="160" y="${labelY + 19}" fill="#b9ad84" font-family="Noto Sans, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="3">${language}</text>
      ${lineMarkup(lines, 105, textY, { fontSize: 39, lineHeight: 55, fill: "#eeece4", weight: 450 })}`
  };
}

export async function renderVerse(bundle, outputPath, sources) {
  const arabicLines = wrapText(bundle.arabic, 34);
  const transliterationLines = wrapText(bundle.transliteration, 48);
  if (arabicLines.length > 3 || transliterationLines.length > 3) {
    throw new Error(`${bundle.surah}:${bundle.verse} est trop long pour une image lisible`);
  }

  let y = 258;
  const arabicSize = arabicLines.length >= 3 ? 53 : arabicLines.length === 2 ? 61 : 70;
  const arabicHeight = (arabicLines.length - 1) * Math.round(arabicSize * 1.55);
  const arabic = lineMarkup(arabicLines, 600, y, {
    fontSize: arabicSize,
    lineHeight: Math.round(arabicSize * 1.55),
    fill: "#f5f1e7",
    weight: 500,
    anchor: "middle",
    family: "Noto Naskh Arabic, Noto Sans Arabic, serif",
    direction: "rtl"
  });

  y += arabicHeight + 65;
  const transliteration = lineMarkup(transliterationLines, 600, y, {
    fontSize: 28,
    lineHeight: 40,
    fill: "#bdb9ab",
    weight: 400,
    anchor: "middle",
    family: "Noto Sans, Arial, sans-serif"
  });
  y += (transliterationLines.length - 1) * 40 + 108;

  const english = translationBlock({ language: "ENGLISH", text: bundle.english, y, flag: gbFlag });
  y = english.bottom + 78;
  const french = translationBlock({ language: "FRANÇAIS", text: bundle.french, y, flag: frFlag });
  y = french.bottom + 78;
  const turkish = translationBlock({ language: "TÜRKÇE", text: bundle.turkish, y, flag: trFlag });

  if (turkish.bottom > 1372) {
    throw new Error(`${bundle.surah}:${bundle.verse} dépasserait la zone lisible (${turkish.bottom}px)`);
  }

  const source = `Quran API • EN ${sources.english} • FR ${sources.french} • TR ${sources.turkish}`;
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17211e"/><stop offset=".58" stop-color="#111917"/><stop offset="1" stop-color="#0c1211"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#71856f" stop-opacity=".13"/><stop offset="1" stop-color="#71856f" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="1500" fill="url(#bg)"/>
    <circle cx="600" cy="260" r="520" fill="url(#glow)"/>
    <rect x="52" y="52" width="1096" height="1396" rx="30" fill="none" stroke="#c8b989" stroke-opacity=".17"/>
    <text x="82" y="105" fill="#c5b887" font-family="Noto Sans, Arial, sans-serif" font-size="21" font-weight="700" letter-spacing="4">SOURATE ${escapeXml(bundle.surahName.toUpperCase())}</text>
    <text x="1118" y="105" fill="#d7d2c3" font-family="Noto Sans, Arial, sans-serif" font-size="21" font-weight="600" text-anchor="end">VERSET ${bundle.verse}  •  ${bundle.surah}:${bundle.verse}</text>
    <path d="M82 137H1118" stroke="#c8b989" stroke-opacity=".2"/>
    ${arabic}
    ${transliteration}
    ${english.svg}
    ${french.svg}
    ${turkish.svg}
    <text x="1118" y="1420" fill="#8e938c" font-family="Noto Sans, Arial, sans-serif" font-size="13" text-anchor="end">${escapeXml(source)}</text>
  </svg>`;

  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(outputPath);
  return { width: WIDTH, height: HEIGHT, outputPath };
}

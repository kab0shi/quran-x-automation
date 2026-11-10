import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { escapeXml, wrapText } from "./format.mjs";
import { moonInfo, moonSvg } from "./moon.mjs";

const WIDTH = 1200;
const HEIGHT = 1500;
const INK = "#e9dec9";

function lineMarkup(lines, x, y, { fontSize = 36, lineHeight = 46, fill = INK, anchor = "start" } = {}) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Noto Serif, Georgia, serif" font-size="${fontSize}" text-anchor="${anchor}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function gbFlag(x, y) {
  return `<g transform="translate(${x} ${y})"><clipPath id="gb"><rect width="64" height="42" rx="4"/></clipPath><g clip-path="url(#gb)"><rect width="64" height="42" fill="#183a77"/><path d="M0 0L64 42M64 0L0 42" stroke="#fff" stroke-width="10"/><path d="M0 0L64 42M64 0L0 42" stroke="#c8102e" stroke-width="5"/><path d="M32 0V42M0 21H64" stroke="#fff" stroke-width="14"/><path d="M32 0V42M0 21H64" stroke="#c8102e" stroke-width="8"/></g></g>`;
}

function frFlag(x, y) {
  return `<g transform="translate(${x} ${y})"><clipPath id="fr"><rect width="64" height="42" rx="4"/></clipPath><g clip-path="url(#fr)"><rect width="22" height="42" fill="#002395"/><rect x="22" width="20" height="42" fill="#fff"/><rect x="42" width="22" height="42" fill="#ed2939"/></g></g>`;
}

function trFlag(x, y) {
  return `<g transform="translate(${x} ${y})"><rect width="64" height="42" rx="4" fill="#e30a17"/><circle cx="27" cy="21" r="13" fill="#fff"/><circle cx="31" cy="21" r="10.5" fill="#e30a17"/><path d="M43 13l2.1 5 5.4.4-4.1 3.5 1.25 5.2-4.65-2.8-4.65 2.8 1.2-5.2-4.05-3.5 5.35-.4z" fill="#fff"/></g>`;
}


function translationRow(text, flag, y) {
  const lines = wrapText(text, 46);
  if (lines.length > 3) throw new Error(`Traduction trop longue (${lines.length} lignes) : carte additionnelle requise`);
  return {
    next: y + (lines.length-1)*46 + 110,
    svg: `${flag(154,y-7)}${lineMarkup(lines, 266, y+28, { fontSize: 36, lineHeight: 46 })}`
  };
}

async function prepareQuranCapture(capture) {
  if (!capture?.path) throw new Error("Capture Quran.com absente : rendu annulé");
  let pipeline = sharp(capture.path);
  if (capture.rect) pipeline = pipeline.extract(capture.rect);
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    const luminance = Math.round(data[offset] * .2126 + data[offset+1] * .7152 + data[offset+2] * .0722);
    const alpha = Math.max(0, Math.min(255, Math.round((230-luminance)*8)));
    const out = pixel*4;
    rgba[out] = 237; rgba[out+1] = 222; rgba[out+2] = 201; rgba[out+3] = alpha;
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 237, g: 222, b: 201, alpha: 0 } })
    .resize({ width: 945, height: 322, fit: "inside", withoutEnlargement: false })
    .png().toBuffer();
}

const ARABIC_SURAHS = {
  1: "سُورَةُ الْفَاتِحَةِ",
  2: "سُورَةُ الْبَقَرَةِ"
};

export async function renderVerse(bundle, outputPath, sources, capture, publishAt = new Date()) {
  const quran = await prepareQuranCapture(capture);
  const captureInfo = await sharp(quran).metadata();
  const captureX = Math.round((WIDTH - captureInfo.width)/2);
  const captureY = Math.round(225 + (322 - captureInfo.height)/2);
  const lunar = moonInfo(publishAt);
  let y = 612;
  const en = translationRow(bundle.english, gbFlag, y); y = en.next;
  const fr = translationRow(bundle.french, frFlag, y); y = fr.next;
  const tr = translationRow(bundle.turkish, trFlag, y);
  if (tr.next > 1255) throw new Error(`Image ${bundle.surah}:${bundle.verse} trop longue pour laisser la lune visible`);

  const surahAr = ARABIC_SURAHS[bundle.surah] || "سُورَة";
  const surahName = `SŪRAT ${bundle.surahName.toUpperCase()}`;
  const moon = moonSvg(publishAt, 600, 1321, 116);
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="night" cx="50%" cy="47%" r="88%">
        <stop offset="0" stop-color="#172435"/><stop offset=".58" stop-color="#0d1929"/><stop offset="1" stop-color="#07111e"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="1500" fill="url(#night)"/>
    <text x="600" y="105" text-anchor="middle" direction="rtl" fill="#d8bea2" font-family="Noto Naskh Arabic, Noto Sans Arabic, serif" font-size="60">${escapeXml(surahAr)}</text>
    <text x="600" y="154" text-anchor="middle" fill="#e6dac6" font-family="Noto Serif, Georgia, serif" font-size="26" letter-spacing="8">${escapeXml(surahName)}</text>
    <text x="600" y="199" text-anchor="middle" fill="#d9c4a8" font-family="Noto Serif, Georgia, serif" font-size="31" letter-spacing="8">${bundle.surah} : ${bundle.verse}</text>
    ${en.svg}
    ${fr.svg}
    ${tr.svg}
    ${moon}
  </svg>`;
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([{ input: quran, left: captureX, top: captureY }])
    .png({ compressionLevel: 9, palette: false }).toFile(outputPath);
  return { width: WIDTH, height: HEIGHT, outputPath, moon: lunar };
}

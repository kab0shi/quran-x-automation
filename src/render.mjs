import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { escapeXml, wrapText } from "./format.mjs";

const WIDTH = 1200;
const HEIGHT = 1500;
const BACKGROUND = "#202124";
const FOREGROUND = { r: 241, g: 243, b: 248 };

function lineMarkup(lines, x, y, options = {}) {
  const {
    fontSize = 38,
    lineHeight = Math.round(fontSize * 1.35),
    fill = "#f1f3f8",
    weight = 400,
    anchor = "start",
    letterSpacing = 0
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Noto Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>`;
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

function translationSection({ language, text, y, flag, drawSeparator = true }) {
  const lines = wrapText(text, 50);
  if (lines.length > 3) throw new Error(`${language} occupe ${lines.length} lignes : image refusée pour préserver la lisibilité`);
  const textY = y + 92;
  const lineHeight = 49;
  const textBottom = textY + (lines.length - 1) * lineHeight;
  const separatorY = textBottom + 55;
  return {
    bottom: drawSeparator ? separatorY : textBottom + 20,
    svg: `${flag(82, y)}
      <text x="160" y="${y + 32}" fill="#d6d7dc" font-family="Noto Sans, Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="1">${language}</text>
      ${lineMarkup(lines, 82, textY, { fontSize: 37, lineHeight, fill: "#f1f3f8" })}
      ${drawSeparator ? `<path d="M78 ${separatorY}H1123" stroke="#777a80" stroke-opacity=".48" stroke-width="2"/>` : ""}`
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
    const luminance = Math.round(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722);
    const alpha = Math.max(0, Math.min(255, Math.round((230 - luminance) * 8)));
    const out = pixel * 4;
    rgba[out] = FOREGROUND.r;
    rgba[out + 1] = FOREGROUND.g;
    rgba[out + 2] = FOREGROUND.b;
    rgba[out + 3] = alpha;
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: FOREGROUND.r, g: FOREGROUND.g, b: FOREGROUND.b, alpha: 0 } })
    .resize({ width: 720, height: 190, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

export async function renderVerse(bundle, outputPath, sources, capture) {
  const quranCapture = await prepareQuranCapture(capture);
  const captureInfo = await sharp(quranCapture).metadata();
  const captureX = Math.round((WIDTH - captureInfo.width) / 2);
  const captureY = 220;

  let y = 555;
  const english = translationSection({ language: "ENGLISH", text: bundle.english, y, flag: gbFlag });
  y = english.bottom + 55;
  const french = translationSection({ language: "FRANÇAIS", text: bundle.french, y, flag: frFlag });
  y = french.bottom + 55;
  const turkish = translationSection({ language: "TÜRKÇE", text: bundle.turkish, y, flag: trFlag, drawSeparator: false });
  if (turkish.bottom > 1325) throw new Error(`${bundle.surah}:${bundle.verse} dépasserait la zone lisible`);

  const source = `Source : Quran.com  •  EN : ${sources.english}  •  FR : ${sources.french}  •  TR : ${sources.turkish}`;
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1500" fill="${BACKGROUND}"/>
    <text x="78" y="106" fill="#f1f3f8" font-family="Noto Sans, Arial, sans-serif" font-size="40" font-weight="800">SOURATE ${escapeXml(bundle.surahName.toUpperCase())}</text>
    <text x="1122" y="103" fill="#aeb0b7" font-family="Noto Sans, Arial, sans-serif" font-size="27" font-weight="700" text-anchor="end">VERSET ${bundle.verse}  •  ${bundle.surah}:${bundle.verse}</text>
    <path d="M78 140H1123" stroke="#777a80" stroke-opacity=".48" stroke-width="3"/>
    ${english.svg}
    ${french.svg}
    ${turkish.svg}
    <text x="1122" y="1465" fill="#aeb0b7" font-family="Noto Sans, Arial, sans-serif" font-size="14" text-anchor="end">${escapeXml(source)}</text>
  </svg>`;

  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([{ input: quranCapture, left: captureX, top: captureY }])
    .png({ compressionLevel: 9, palette: false })
    .toFile(outputPath);
  return { width: WIDTH, height: HEIGHT, outputPath };
}

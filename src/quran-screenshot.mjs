import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function enableInlineTransliteration(page) {
  await page.goto("https://quran.com/1", { waitUntil: "domcontentloaded" });
  const settings = page.locator('button[aria-label*="settings" i], button[aria-label*="paramètres" i]').first();
  await settings.waitFor({ state: "visible", timeout: 20_000 });
  await settings.click();
  await page.getByRole("tab", { name: /word by word|mot par mot/i }).click();
  await page.locator('input[name="inline-transliteration"]').check();
  const inlineTranslation = page.locator('input[name="inline-translation"]');
  if (await inlineTranslation.isChecked()) await inlineTranslation.uncheck();
  const increase = page.getByRole("button", { name: /increase|augmenter/i });
  for (let step = 0; step < 3 && await increase.isEnabled(); step += 1) await increase.click();
  await page.getByRole("button", { name: /^ok$/i }).click();
}

export async function captureQuranVerses(pointers, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 920 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      locale: "fr-FR"
    });
    const page = await context.newPage();
    await enableInlineTransliteration(page);
    const captures = new Map();
    for (const pointer of pointers) {
      await page.goto(`https://quran.com/${pointer.surah}/${pointer.verse}`, { waitUntil: "domcontentloaded" });
      const verse = page.locator('[class*="VerseText_verseTextContainer"]').first();
      await verse.waitFor({ state: "visible", timeout: 20_000 });
      const path = join(outputDirectory, `${pointer.surah}-${pointer.verse}.png`);
      await verse.screenshot({ path });
      captures.set(`${pointer.surah}:${pointer.verse}`, { path });
    }
    return captures;
  } finally {
    await browser.close();
  }
}

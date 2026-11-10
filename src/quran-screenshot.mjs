import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function enableInlineTransliteration(page) {
  await page.goto("https://quran.com/fr/louverture?readingMode=verse-by-verse&translations=31%2C85%2C77", { waitUntil: "domcontentloaded" });
  const settings = page.locator('button[aria-label*="settings" i]:visible, button[aria-label*="paramètres" i]:visible').first();
  await settings.waitFor({ state: "visible", timeout: 20_000 });
  await settings.click();
  await page.getByRole("button", { name: /^IndoPak$/i }).click();
  const arabicIncrease = page.getByRole("button", { name: /increase|augmenter/i });
  for (let step = 0; step < 10 && await arabicIncrease.isEnabled(); step += 1) await arabicIncrease.click();
  await page.getByRole("tab", { name: /word by word|mot par mot/i }).click();
  await page.locator('input[name="inline-transliteration"]').check();
  const inlineTranslation = page.locator('input[name="inline-translation"]');
  if (await inlineTranslation.isChecked()) await inlineTranslation.uncheck();
  const transliterationIncrease = page.getByRole("button", { name: /increase|augmenter/i });
  for (let step = 0; step < 10 && await transliterationIncrease.isEnabled(); step += 1) await transliterationIncrease.click();
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
    try {
      await enableInlineTransliteration(page);
      const captures = new Map();
      for (const pointer of pointers) {
        await page.goto(`https://quran.com/${pointer.surah}/${pointer.verse}`, { waitUntil: "domcontentloaded" });
        const verse = page.locator('[class*="VerseText_verseTextContainer"]:visible').first();
        await verse.waitFor({ state: "visible", timeout: 20_000 });
        const path = join(outputDirectory, `${pointer.surah}-${pointer.verse}.png`);
        await verse.screenshot({ path });
        captures.set(`${pointer.surah}:${pointer.verse}`, { path });
      }
      return captures;
    } catch (error) {
      // Keep a screenshot and UI inventory for diagnosing Quran.com UI updates.
      await page.screenshot({ path: join(outputDirectory, "debug-quran.png"), fullPage: true }).catch(() => {});
      const buttons = await page.locator('button:visible, [role="tab"]:visible').evaluateAll((nodes) =>
        nodes.map((node) => ({
          role: node.getAttribute("role") || "button",
          aria: node.getAttribute("aria-label"),
          text: (node.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 90)
        })).slice(0, 90)).catch(() => []);
      console.error("Quran.com URL :", page.url(), "Boutons visibles :", JSON.stringify(buttons));
      throw error;
    }
  } finally {
    await browser.close();
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import config from "../config.json" with { type: "json" };
import { altTextFor, cleanText, wrapText } from "../src/format.mjs";
import { nextPointer, takePointers } from "../src/quran.mjs";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/al-fatiha.json", import.meta.url), "utf8"));

test("avance entre les versets et les sourates", () => {
  assert.deepEqual(nextPointer({ surah: 1, verse: 7 }), { surah: 2, verse: 1 });
  assert.deepEqual(takePointers({ surah: 1, verse: 5 }, 5).next, { surah: 2, verse: 3 });
});

test("nettoie les notes et balises", () => {
  assert.equal(cleanText("Souverain[3] <b>du Jour</b>"), "Souverain du Jour");
});

test("le retour à la ligne conserve tout le texte", () => {
  const source = "Un exemple de texte suffisamment long pour être réparti";
  assert.equal(wrapText(source, 15).join(" "), source);
});

test("texte alternatif complet et acceptable pour X", () => {
  const alt = altTextFor(fixtures[4], config.sources);
  assert.match(alt, /Arabe/);
  assert.match(alt, /Translittération/);
  assert.match(alt, /Français/);
  assert.ok(alt.length <= 1000);
});

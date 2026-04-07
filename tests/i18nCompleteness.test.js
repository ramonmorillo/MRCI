import test from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/i18n/en.js";
import { es } from "../src/i18n/es.js";

test("bilingual UI includes CIMA search states and report actions", () => {
  assert.ok(en.buttons.print_report);
  assert.ok(en.buttons.download_report);
  assert.ok(en.labels.cima_searching);
  assert.ok(en.labels.cima_min_chars);
  assert.ok(en.nav.report);

  assert.ok(es.buttons.print_report);
  assert.ok(es.buttons.download_report);
  assert.ok(es.labels.cima_searching);
  assert.ok(es.labels.cima_min_chars);
  assert.ok(es.nav.report);

  assert.equal(es.buttons.print_report, "Imprimir informe");
  assert.equal(es.labels.cima_searching, "Buscando en CIMA...");
});

import test from "node:test";
import assert from "node:assert/strict";
import { appendMedication, removeMedicationAt, duplicateMedicationAt } from "../src/lib/medicationEntry/workflow.js";
import { defaultMedication } from "../src/models.js";
import { es } from "../src/i18n/es.js";
import fs from "node:fs";

test("active ingredient search mode is available", () => {
  const mainSource = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf-8");
  assert.match(mainSource, /value=\"ingredient\"/);
});

test("adding first, second and third medication appends rows", () => {
  const one = appendMedication([], { ...defaultMedication(), drugName: "A" });
  const two = appendMedication(one, { ...defaultMedication(), drugName: "B" });
  const three = appendMedication(two, { ...defaultMedication(), drugName: "C" });
  assert.deepEqual(three.map((m) => m.drugName), ["A", "B", "C"]);
});

test("deleting one medication keeps others intact", () => {
  const list = ["A", "B", "C"].map((name) => ({ ...defaultMedication(), drugName: name }));
  const updated = removeMedicationAt(list, 1);
  assert.deepEqual(updated.map((m) => m.drugName), ["A", "C"]);
});

test("spanish labels for dynamic workflow controls are in Spanish", () => {
  assert.equal(es.buttons.add, "Añadir fármaco");
  assert.match(es.labels.search_ingredient, /Principio activo/);
});

test("apply result to control is removed and add medication button exists", () => {
  const mainSource = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf-8");
  assert.doesNotMatch(mainSource, /cimaApplyRow/);
  assert.match(mainSource, /addMedicationBtn/);
});

test("duplicate action keeps existing rows and inserts a copy", () => {
  const list = ["A", "B"].map((name, idx) => ({ ...defaultMedication(), id: `id-${idx}`, drugName: name }));
  const duplicated = duplicateMedicationAt(list, 0, () => "copy-id");
  assert.deepEqual(duplicated.map((m) => m.drugName), ["A", "A", "B"]);
  assert.equal(duplicated[1].id, "copy-id");
});

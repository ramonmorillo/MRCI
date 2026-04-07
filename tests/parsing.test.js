import test from "node:test";
import assert from "node:assert/strict";
import { parseMedicationText } from "../src/lib/parsing/textParser.js";

test("simple medication list parses core fields", () => {
  const result = parseMedicationText("Metformin 500 mg tablet BID\nLisinopril 10 mg daily");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].fields.strength.value.toLowerCase(), "500 mg");
  assert.ok(result.candidates[0].fields.frequency.value);
});

test("discharge summary style note handles PRN and evidence", () => {
  const text = "Discharge meds: Albuterol inhaler 2 puffs q6h PRN wheeze; Prednisone taper 40 mg x3 days then 20 mg x3 days";
  const result = parseMedicationText(text);
  const albuterol = result.candidates.find((c) => c.sourceText.toLowerCase().includes("albuterol"));
  assert.equal(albuterol.fields.prn.value, "yes");
  assert.ok(albuterol.fields.evidence.value.includes("Albuterol"));
  assert.ok(result.candidates.some((c) => c.flags.includes("tapering-regimen")));
});

test("mixed Spanish and English frequency expressions are detected", () => {
  const result = parseMedicationText("Losartan 50 mg tableta cada 12h\nAspirin 81 mg daily");
  assert.ok(result.candidates.some((c) => c.fields.frequency.value === "bid"));
  assert.ok(result.candidates.some((c) => c.fields.frequency.value === "daily"));
});

test("inhaler instructions map dosage form and route", () => {
  const result = parseMedicationText("Fluticasone inhaler 1 puff BID");
  assert.equal(result.candidates[0].fields.dosageForm.value, "inhaler");
  assert.equal(result.candidates[0].fields.route.value, "inhaled");
});

test("ambiguous frequency and unknown form are flagged", () => {
  const result = parseMedicationText("Vitamin D as directed");
  assert.ok(result.candidates[0].flags.includes("ambiguous-frequency"));
  assert.ok(result.candidates[0].needsManualReview);
});

test("tapering schedule and alternating doses are flagged", () => {
  const result = parseMedicationText("Prednisone 20 mg taper over 6 days and alternate days");
  assert.ok(result.candidates[0].flags.includes("tapering-regimen"));
  assert.ok(result.candidates[0].flags.includes("alternating-dose"));
});

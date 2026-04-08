import test from "node:test";
import assert from "node:assert/strict";
import { mrciClassic, mrciClassicMappings } from "../src/lib/scoring/mrciClassic.js";
import { aMrci } from "../src/lib/scoring/aMrci.js";
import { scoreAll } from "../src/scoring.js";

function med(overrides) {
  return {
    id: crypto.randomUUID(),
    drugName: "Drug",
    dosageFormRoute: "tablet",
    dosageForm: "tablet",
    frequency: "daily",
    prn: false,
    additionalInstructions: "",
    notes: "",
    validated: true,
    ...overrides
  };
}

const fullMappings = {
  mrciClassic: mrciClassicMappings,
  aMrci: {
    dosageForms: (await import("../src/lib/mappings/aMrci/dosageForms.js")).aMrciDosageForms,
    frequencies: (await import("../src/lib/mappings/aMrci/frequencies.js")).aMrciFrequencies,
    additionalDirections: (await import("../src/lib/mappings/aMrci/additionalDirections.js")).aMrciAdditionalDirections
  }
};

test("1 simple oral medication once daily", () => {
  const result = scoreAll([med()], fullMappings, "compare");
  assert.equal(result.classic.total, 2);
  assert.equal(result.amrci.total, 2);
});

test("2 oral medications with different frequencies", () => {
  const result = scoreAll([
    med({ drugName: "Metformin", frequency: "once daily" }),
    med({ drugName: "Losartan", frequency: "twice daily" })
  ], fullMappings, "compare");
  assert.equal(result.classic.total, 5);
  assert.equal(result.amrci.total, 4.5);
});

test("inhaler + oral drug", () => {
  const result = scoreAll([
    med({ drugName: "Salbutamol", dosageFormRoute: "inhaler", dosageForm: "inhaler", additionalInstructions: "rinse mouth" }),
    med({ drugName: "Atorvastatin", dosageFormRoute: "tablet", dosageForm: "tablet" })
  ], fullMappings, "compare");
  assert.equal(result.classic.total, 7);
  assert.equal(result.amrci.total, 5.5);
});

test("PRN medication increases section B", () => {
  const base = scoreAll([med({ prn: false })], fullMappings, "compare");
  const prn = scoreAll([med({ prn: true })], fullMappings, "compare");
  assert.equal(prn.classic.total, base.classic.total + 0.5);
  assert.equal(prn.amrci.total, base.amrci.total + 0.25);
});

test("food-related instruction adds section C", () => {
  const withFood = scoreAll([med({ additionalInstructions: "with food" })], fullMappings, "compare");
  assert.equal(withFood.classic.subtotalC, 1);
  assert.equal(withFood.amrci.subtotalC, 0.5);
});

test("alternating dose / variable dose", () => {
  const alt = scoreAll([med({ additionalInstructions: "alternate days" })], fullMappings, "compare");
  assert.equal(alt.classic.subtotalB, 2);
  assert.equal(alt.amrci.subtotalB, 1.5);
});

test("more than one medication row remains stable", () => {
  const meds = [
    med({ drugName: "A", frequency: "daily" }),
    med({ drugName: "B", frequency: "q6h", additionalInstructions: "with food" }),
    med({ drugName: "C", dosageFormRoute: "injection", dosageForm: "injection", prn: true })
  ];
  const classic = mrciClassic(meds, fullMappings.mrciClassic);
  const amrci = aMrci(meds, fullMappings);
  assert.equal(classic.breakdown.length, 3);
  assert.equal(amrci.breakdown.length, 3);
  assert.ok(amrci.warnings.some((w) => w.type === "approximate"));
});

test("scores are independent from language labels", () => {
  const english = med({ dosageFormRoute: "tablet", frequency: "daily" });
  const spanish = med({ dosageFormRoute: "tablet", frequency: "daily", additionalInstructions: "con comida" });
  const result = scoreAll([english, spanish], fullMappings, "compare");
  assert.equal(result.classic.total, 5);
});

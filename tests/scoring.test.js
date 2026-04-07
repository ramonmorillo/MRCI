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

test("MRCI baseline remains unchanged for simple oral chronic regimen", () => {
  const result = mrciClassic([med({ drugName: "Metformin", additionalInstructions: "take with food" })]);
  assert.equal(result.total, 3); // A=1, B=1, C=1
});

test("inhalers: both engines score higher form complexity than tablet", () => {
  const tabletClassic = mrciClassic([med({ dosageFormRoute: "tablet" })]).subtotalA;
  const inhalerClassic = mrciClassic([med({ dosageFormRoute: "inhaler" })]).subtotalA;
  const inhalerAmrci = aMrci([med({ dosageFormRoute: "inhaler" })], fullMappings).subtotalA;
  assert.ok(inhalerClassic > tabletClassic);
  assert.ok(inhalerAmrci >= 2);
});

test("injectables are captured by both engines", () => {
  const classic = mrciClassic([med({ dosageFormRoute: "injection" })]).subtotalA;
  const abr = aMrci([med({ dosageFormRoute: "injection" })], fullMappings).subtotalA;
  assert.ok(classic >= 3);
  assert.ok(abr >= 2);
});

test("PRN medications increase Section B in both engines", () => {
  const base = scoreAll([med({ prn: false })], fullMappings, "compare");
  const prn = scoreAll([med({ prn: true })], fullMappings, "compare");
  assert.ok(prn.classic.subtotalB > base.classic.subtotalB);
  assert.ok(prn.amrci.subtotalB > base.amrci.subtotalB);
});

test("alternating doses increase complexity", () => {
  const standard = scoreAll([med({ frequency: "daily" })], fullMappings, "compare");
  const alt = scoreAll([med({ frequency: "daily", additionalInstructions: "alternate days" })], fullMappings, "compare");
  assert.ok(alt.classic.subtotalB > standard.classic.subtotalB);
  assert.ok(alt.amrci.subtotalB > standard.amrci.subtotalB);
});

test("food-related instructions affect section C", () => {
  const noFood = scoreAll([med({ additionalInstructions: "" })], fullMappings, "compare");
  const withFood = scoreAll([med({ additionalInstructions: "take with food" })], fullMappings, "compare");
  assert.ok(withFood.classic.subtotalC > noFood.classic.subtotalC);
  assert.ok(withFood.amrci.subtotalC > noFood.amrci.subtotalC);
});

test("missing directions are handled safely with warnings in A-MRCI", () => {
  const result = scoreAll([med({ additionalInstructions: "unclear instruction" })], fullMappings, "compare");
  assert.equal(result.amrci.warnings.length, 0);
  const unknown = scoreAll([med({ dosageFormRoute: "???", frequency: "sometimes", additionalInstructions: "titrate weirdly" })], fullMappings, "compare");
  assert.ok(unknown.amrci.warnings.length >= 2);
});

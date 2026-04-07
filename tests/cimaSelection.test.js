import test from "node:test";
import assert from "node:assert/strict";
import { defaultMedication } from "../src/models.js";
import { applyCimaSelectionToMedication } from "../src/lib/integrations/cimaMedicationMapper.js";
import { scoreAll } from "../src/scoring.js";
import { mrciClassicMappings } from "../src/lib/scoring/mrciClassic.js";

const fullMappings = {
  mrciClassic: mrciClassicMappings,
  aMrci: {
    dosageForms: (await import("../src/lib/mappings/aMrci/dosageForms.js")).aMrciDosageForms,
    frequencies: (await import("../src/lib/mappings/aMrci/frequencies.js")).aMrciFrequencies,
    additionalDirections: (await import("../src/lib/mappings/aMrci/additionalDirections.js")).aMrciAdditionalDirections
  }
};

test("selecting CIMA medication fills structured fields", () => {
  const med = defaultMedication();
  const updated = applyCimaSelectionToMedication(med, {
    drugName: "Metformin STADA",
    dosageForm: "tableta",
    route: "vía oral",
    cimaNationalCode: "847123",
    cimaRegistrationNumber: "51347"
  });
  assert.equal(updated.drugName, "Metformin STADA");
  assert.equal(updated.cimaNationalCode, "847123");
});

test("manual regimen fields remain unchanged after CIMA import", () => {
  const med = { ...defaultMedication(), frequency: "daily", prn: true, additionalInstructions: "take with food" };
  const updated = applyCimaSelectionToMedication(med, { drugName: "Aspirin", dosageForm: "tablet" });
  assert.equal(updated.frequency, "daily");
  assert.equal(updated.prn, true);
  assert.equal(updated.additionalInstructions, "take with food");
});

test("CIMA import does not auto-change scoring unless user edits scoring fields", () => {
  const base = {
    ...defaultMedication(),
    drugName: "Drug",
    dosageForm: "tablet",
    dosageFormRoute: "tablet",
    frequency: "daily",
    validated: true
  };
  const before = scoreAll([base], fullMappings, "compare");
  const afterMed = applyCimaSelectionToMedication(base, {
    drugName: "Drug brand",
    cimaNationalCode: "12345",
    cimaRegistrationNumber: "67890"
  });
  const after = scoreAll([afterMed], fullMappings, "compare");
  assert.equal(after.classic.total, before.classic.total);
  assert.equal(after.amrci.total, before.amrci.total);
});

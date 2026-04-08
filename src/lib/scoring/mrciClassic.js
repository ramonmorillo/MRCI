import { mrciClassicAdditionalDirections } from "../mappings/mrciClassic/additionalDirections.js";
import { mrciClassicDosageForms } from "../mappings/mrciClassic/dosageForms.js";
import { mrciClassicFrequencies } from "../mappings/mrciClassic/frequencies.js";
import {
  buildTotals,
  extractDirectionKeys,
  hasAlternating,
  normalizeMedicationRow,
  resolveAlias,
  warning
} from "./shared.js";

export const mrciClassicMappings = {
  dosageForms: mrciClassicDosageForms,
  frequencies: mrciClassicFrequencies,
  additionalDirections: mrciClassicAdditionalDirections
};

// Technical note:
// - Corrected classic scoring traceability by normalizing every medication row before scoring.
// - Added explicit warnings for inferred fields and unknown mappings instead of silent fallbacks.
// - Kept section model (A/B/C) intact for fidelity; further validation still depends on local clinical governance.
export function mrciClassic(medications, mappings = mrciClassicMappings) {
  const { dosageForms, frequencies, additionalDirections } = mappings;
  const breakdown = [];
  const warnings = [];
  const debugRows = [];

  medications.forEach((med) => {
    const { normalized, inferred } = normalizeMedicationRow(med);

    const formKey = resolveAlias(dosageForms.aliases, normalized.dosageFormRoute, "unknown");
    const freqKey = resolveAlias(frequencies.aliases, normalized.frequency, "unknown");
    const dirKeys = extractDirectionKeys(additionalDirections.keywords, normalized.additionalInstructions);

    if (inferred.length) warnings.push(warning("inferred", "dosage form/route", "Field inferred from available row data", normalized.id, normalized.drugName, { inferred }));
    if (formKey === "unknown") warnings.push(warning("unmapped", "dosage form/route", "MRCI dosage form not mapped", normalized.id, normalized.drugName));
    if (freqKey === "unknown") warnings.push(warning("unmapped", "frequency", "MRCI frequency not mapped", normalized.id, normalized.drugName));

    const sectionA = dosageForms.sectionWeights[formKey] ?? dosageForms.sectionWeights.unknown;
    let sectionB = frequencies.sectionWeights[freqKey] ?? frequencies.sectionWeights.unknown;
    if (normalized.prn) sectionB += frequencies.sectionWeights.prn_modifier;
    if (hasAlternating(normalized.frequency, normalized.additionalInstructions)) {
      sectionB += frequencies.sectionWeights.alternating_modifier;
    }
    const sectionC = dirKeys.reduce((sum, k) => sum + (additionalDirections.sectionWeights[k] ?? 0), 0);
    const total = Number((sectionA + sectionB + sectionC).toFixed(2));

    breakdown.push({
      medicationId: normalized.id,
      drugName: normalized.drugName,
      sectionA,
      sectionB,
      sectionC,
      total,
      explanation: { formKey, freqKey, dirKeys, prn: normalized.prn }
    });

    debugRows.push({
      medicationId: normalized.id,
      normalizedMedication: normalized,
      appliedWeights: { sectionAKey: formKey, sectionA, sectionBKey: freqKey, sectionB, sectionCDirectionKeys: dirKeys, sectionC },
      total
    });
  });

  return buildTotals("mrciClassic", breakdown, warnings, debugRows);
}

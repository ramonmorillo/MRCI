import { mrciClassicAdditionalDirections } from "../mappings/mrciClassic/additionalDirections.js";
import { mrciClassicDosageForms } from "../mappings/mrciClassic/dosageForms.js";
import { mrciClassicFrequencies } from "../mappings/mrciClassic/frequencies.js";
import {
  buildTotals,
  extractDirectionKeys,
  hasAlternating,
  resolveAlias
} from "./shared.js";

export const mrciClassicMappings = {
  dosageForms: mrciClassicDosageForms,
  frequencies: mrciClassicFrequencies,
  additionalDirections: mrciClassicAdditionalDirections
};

export function mrciClassic(medications, mappings = mrciClassicMappings) {
  const { dosageForms, frequencies, additionalDirections } = mappings;
  const breakdown = medications.map((med) => {
    const formKey = resolveAlias(dosageForms.aliases, med.dosageFormRoute, "unknown");
    const freqKey = resolveAlias(frequencies.aliases, med.frequency, "unknown");
    const dirKeys = extractDirectionKeys(additionalDirections.keywords, med.additionalInstructions);

    const sectionA = dosageForms.sectionWeights[formKey] ?? dosageForms.sectionWeights.unknown;
    let sectionB = frequencies.sectionWeights[freqKey] ?? frequencies.sectionWeights.unknown;
    if (med.prn) sectionB += frequencies.sectionWeights.prn_modifier;
    if (hasAlternating(med.frequency, med.additionalInstructions)) {
      sectionB += frequencies.sectionWeights.alternating_modifier;
    }
    const sectionC = dirKeys.reduce((sum, k) => sum + (additionalDirections.sectionWeights[k] ?? 0), 0);

    return {
      medicationId: med.id,
      drugName: med.drugName,
      sectionA,
      sectionB,
      sectionC,
      total: Number((sectionA + sectionB + sectionC).toFixed(2)),
      explanation: { formKey, freqKey, dirKeys, prn: med.prn }
    };
  });

  return buildTotals("mrciClassic", breakdown);
}

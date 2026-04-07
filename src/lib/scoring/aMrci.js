import { aMrciAdditionalDirections } from "../mappings/aMrci/additionalDirections.js";
import { aMrciDosageForms } from "../mappings/aMrci/dosageForms.js";
import { aMrciFrequencies } from "../mappings/aMrci/frequencies.js";
import { mrciClassicMappings } from "./mrciClassic.js";
import {
  buildTotals,
  extractDirectionKeys,
  hasAlternating,
  resolveAlias,
  warning
} from "./shared.js";

export const aMrciMappings = {
  dosageForms: aMrciDosageForms,
  frequencies: aMrciFrequencies,
  additionalDirections: aMrciAdditionalDirections
};

export function aMrci(medications, mappings = { mrciClassic: mrciClassicMappings, aMrci: aMrciMappings }, corrections = {}) {
  const classicMappings = mappings.mrciClassic || mappings.classic || mrciClassicMappings;
  const amrciMappings = mappings.aMrci || aMrciMappings;
  const breakdown = [];
  const warnings = [];

  medications.forEach((med) => {
    const classicForm = resolveAlias(classicMappings.dosageForms.aliases, med.dosageFormRoute, "unknown");
    const classicFreq = resolveAlias(classicMappings.frequencies.aliases, med.frequency, "unknown");
    const classicDirs = extractDirectionKeys(
      classicMappings.additionalDirections.keywords,
      med.additionalInstructions
    );

    const medFixes = corrections[med.id] || {};
    const formKey = medFixes.formKey || amrciMappings.dosageForms.aliasesFromClassic[classicForm] || "unknown";
    const freqKey = medFixes.freqKey || amrciMappings.frequencies.aliasesFromClassic[classicFreq] || "unknown";
    const mappedDirs = classicDirs.map((k) => medFixes.dirMap?.[k] || amrciMappings.additionalDirections.aliasesFromClassic[k] || "unmapped");
    const dirKeys = [...new Set(mappedDirs.filter((k) => k !== "unmapped"))];

    if (formKey === "unknown") warnings.push(warning("unmapped", "dosage form/route", "A-MRCI dosage form not mapped", med.id, med.drugName));
    if (freqKey === "unknown") warnings.push(warning("unmapped", "frequency", "A-MRCI frequency not mapped", med.id, med.drugName));
    if (mappedDirs.includes("unmapped")) warnings.push(warning("unmapped", "additional directions", "One or more A-MRCI additional direction mappings missing", med.id, med.drugName));

    const sectionA = amrciMappings.dosageForms.sectionWeights[formKey] ?? amrciMappings.dosageForms.sectionWeights.unknown;
    let sectionB = amrciMappings.frequencies.sectionWeights[freqKey] ?? amrciMappings.frequencies.sectionWeights.unknown;
    if (med.prn) sectionB += amrciMappings.frequencies.sectionWeights.prn_modifier;
    if (hasAlternating(med.frequency, med.additionalInstructions)) {
      sectionB += amrciMappings.frequencies.sectionWeights.alternating_modifier;
    }
    const sectionC = Number(dirKeys.reduce((sum, k) => sum + (amrciMappings.additionalDirections.sectionWeights[k] ?? 0), 0).toFixed(2));

    breakdown.push({
      medicationId: med.id,
      drugName: med.drugName,
      sectionA,
      sectionB,
      sectionC,
      total: Number((sectionA + sectionB + sectionC).toFixed(2)),
      manualReviewRequired: formKey === "unknown" || freqKey === "unknown" || mappedDirs.includes("unmapped"),
      explanation: {
        formKey,
        freqKey,
        dirKeys,
        sourceForm: classicForm,
        sourceFrequency: classicFreq,
        sourceDirections: classicDirs,
        model: "Configurable A-MRCI based on published automation-oriented logic; local validation required."
      }
    });
  });

  return buildTotals("aMrci", breakdown, warnings);
}

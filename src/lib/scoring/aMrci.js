import { aMrciAdditionalDirections } from "../mappings/aMrci/additionalDirections.js";
import { aMrciDosageForms } from "../mappings/aMrci/dosageForms.js";
import { aMrciFrequencies } from "../mappings/aMrci/frequencies.js";
import { mrciClassicMappings } from "./mrciClassic.js";
import {
  buildTotals,
  extractDirectionKeys,
  hasAlternating,
  normalizeMedicationRow,
  resolveAlias,
  warning
} from "./shared.js";

export const aMrciMappings = {
  dosageForms: aMrciDosageForms,
  frequencies: aMrciFrequencies,
  additionalDirections: aMrciAdditionalDirections
};

// Technical note:
// - Corrected A-MRCI pipeline to make approximation boundaries explicit per medication row.
// - Added warnings for inferred fields, approximate classic->A-MRCI mapping, and unmapped fields.
// - Remaining limitation: A-MRCI weight set is still configurable/approximate and requires local validation.
export function aMrci(medications, mappings = { mrciClassic: mrciClassicMappings, aMrci: aMrciMappings }, corrections = {}) {
  const classicMappings = mappings.mrciClassic || mappings.classic || mrciClassicMappings;
  const amrciMappings = mappings.aMrci || aMrciMappings;
  const breakdown = [];
  const warnings = [];
  const debugRows = [];

  medications.forEach((med) => {
    const { normalized, inferred } = normalizeMedicationRow(med);
    const classicForm = resolveAlias(classicMappings.dosageForms.aliases, normalized.dosageFormRoute, "unknown");
    const classicFreq = resolveAlias(classicMappings.frequencies.aliases, normalized.frequency, "unknown");
    const classicDirs = extractDirectionKeys(
      classicMappings.additionalDirections.keywords,
      normalized.additionalInstructions
    );

    const medFixes = corrections[normalized.id] || {};
    const formKey = medFixes.formKey || amrciMappings.dosageForms.aliasesFromClassic[classicForm] || "unknown";
    const freqKey = medFixes.freqKey || amrciMappings.frequencies.aliasesFromClassic[classicFreq] || "unknown";
    const mappedDirs = classicDirs.map((k) => medFixes.dirMap?.[k] || amrciMappings.additionalDirections.aliasesFromClassic[k] || "unmapped");
    const dirKeys = [...new Set(mappedDirs.filter((k) => k !== "unmapped"))];

    warnings.push(
      warning(
        "approximate",
        "engine",
        "A-MRCI score uses approximation mappings and requires local validation",
        normalized.id,
        normalized.drugName
      )
    );
    if (inferred.length) warnings.push(warning("inferred", "dosage form/route", "Field inferred from available row data", normalized.id, normalized.drugName, { inferred }));
    if (formKey === "unknown") warnings.push(warning("unmapped", "dosage form/route", "A-MRCI dosage form not mapped", normalized.id, normalized.drugName));
    if (freqKey === "unknown") warnings.push(warning("unmapped", "frequency", "A-MRCI frequency not mapped", normalized.id, normalized.drugName));
    if (mappedDirs.includes("unmapped")) warnings.push(warning("unmapped", "additional directions", "One or more A-MRCI additional direction mappings missing", normalized.id, normalized.drugName));

    const sectionA = amrciMappings.dosageForms.sectionWeights[formKey] ?? amrciMappings.dosageForms.sectionWeights.unknown;
    let sectionB = amrciMappings.frequencies.sectionWeights[freqKey] ?? amrciMappings.frequencies.sectionWeights.unknown;
    if (normalized.prn) sectionB += amrciMappings.frequencies.sectionWeights.prn_modifier;
    if (hasAlternating(normalized.frequency, normalized.additionalInstructions)) {
      sectionB += amrciMappings.frequencies.sectionWeights.alternating_modifier;
    }
    const sectionC = Number(dirKeys.reduce((sum, k) => sum + (amrciMappings.additionalDirections.sectionWeights[k] ?? 0), 0).toFixed(2));
    const total = Number((sectionA + sectionB + sectionC).toFixed(2));

    breakdown.push({
      medicationId: normalized.id,
      drugName: normalized.drugName,
      sectionA,
      sectionB,
      sectionC,
      total,
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

    debugRows.push({
      medicationId: normalized.id,
      normalizedMedication: normalized,
      classicResolved: { form: classicForm, frequency: classicFreq, directions: classicDirs },
      aMrciResolved: { formKey, freqKey, mappedDirs, dirKeys },
      appliedWeights: { sectionA, sectionB, sectionC },
      total
    });
  });

  return buildTotals("aMrci", breakdown, warnings, debugRows);
}

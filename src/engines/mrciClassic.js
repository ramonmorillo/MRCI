import {
  directionKeys,
  hasAlternating,
  resolveFormKey,
  resolveFrequencyKey
} from "./shared.js";

export function mrciClassic(medications, mappings) {
  const { dosageForms, frequencies, additionalDirections } = mappings;
  const breakdown = medications.map((med) => {
    const formKey = resolveFormKey(dosageForms, med.dosageFormRoute);
    const freqKey = resolveFrequencyKey(frequencies, med.frequency);
    const dirKeys = directionKeys(additionalDirections, med.additionalInstructions);

    const sectionA = dosageForms.classic[formKey] ?? dosageForms.classic.unknown;
    let sectionB = frequencies.classic[freqKey] ?? frequencies.classic.unknown;
    if (med.prn) sectionB += frequencies.classic.prn_modifier;
    if (hasAlternating(med.frequency, med.additionalInstructions)) {
      sectionB += frequencies.classic.alternating_modifier;
    }

    const directionScore = dirKeys.reduce(
      (sum, k) => sum + (additionalDirections.classic[k] ?? 0),
      0
    );
    const sectionC = directionScore;

    return {
      medicationId: med.id,
      drugName: med.drugName,
      sectionA,
      sectionB,
      sectionC,
      total: Number((sectionA + sectionB + sectionC).toFixed(2)),
      explanation: {
        formKey,
        freqKey,
        dirKeys,
        prn: med.prn
      }
    };
  });

  return totalsFromBreakdown("mrciClassic", breakdown);
}

export function totalsFromBreakdown(engine, breakdown) {
  const subtotalA = Number(
    breakdown.reduce((sum, row) => sum + row.sectionA, 0).toFixed(2)
  );
  const subtotalB = Number(
    breakdown.reduce((sum, row) => sum + row.sectionB, 0).toFixed(2)
  );
  const subtotalC = Number(
    breakdown.reduce((sum, row) => sum + row.sectionC, 0).toFixed(2)
  );

  return {
    engine,
    subtotalA,
    subtotalB,
    subtotalC,
    total: Number((subtotalA + subtotalB + subtotalC).toFixed(2)),
    breakdown
  };
}

import {
  directionKeys,
  hasAlternating,
  resolveFormKey,
  resolveFrequencyKey
} from "./shared.js";
import { totalsFromBreakdown } from "./mrciClassic.js";

const formToAbbrev = {
  tablet_or_capsule_or_pill: "oral_simple",
  liquid_or_solution_or_suspension: "oral_liquid",
  inhaler_or_nebulizer: "inhaled",
  injection: "injectable",
  topical_patch: "topical_or_transdermal",
  eye_or_ear_drop: "ophthalmic_otologic",
  subcutaneous_device: "device_complex",
  complex_device: "device_complex",
  unknown: "unknown"
};

const freqToAbbrev = {
  once_daily: "daily_or_less",
  twice_daily: "twice_daily",
  three_times_daily: "three_plus_daily",
  four_times_daily: "three_plus_daily",
  every_6_hours: "three_plus_daily",
  every_4_hours: "three_plus_daily",
  weekly: "weekly_or_monthly",
  monthly: "weekly_or_monthly",
  unknown: "unknown"
};

const dirMap = {
  with_food: "food_related",
  without_food: "food_related",
  split_or_crush_or_mix: "special_handling",
  taper_or_variable_schedule: "variable_schedule",
  specific_time_of_day: "special_handling",
  inhaler_technique: "device_technique",
  monitoring_or_special_instruction: "special_handling",
  none: "none"
};

export function aMrci(medications, mappings) {
  const { dosageForms, frequencies, additionalDirections } = mappings;
  const breakdown = medications.map((med) => {
    const formClassic = resolveFormKey(dosageForms, med.dosageFormRoute);
    const freqClassic = resolveFrequencyKey(frequencies, med.frequency);
    const dirClassic = directionKeys(additionalDirections, med.additionalInstructions);

    const formKey = formToAbbrev[formClassic] ?? "unknown";
    const freqKey = freqToAbbrev[freqClassic] ?? "unknown";
    const dirKeys = [...new Set(dirClassic.map((k) => dirMap[k] ?? "none"))];

    const sectionA = dosageForms.abbreviated[formKey] ?? dosageForms.abbreviated.unknown;
    let sectionB = frequencies.abbreviated[freqKey] ?? frequencies.abbreviated.unknown;
    if (med.prn) sectionB += frequencies.abbreviated.prn_modifier;
    if (hasAlternating(med.frequency, med.additionalInstructions)) {
      sectionB += frequencies.abbreviated.alternating_modifier;
    }

    const sectionC = Number(
      dirKeys
        .reduce((sum, k) => sum + (additionalDirections.abbreviated[k] ?? 0), 0)
        .toFixed(2)
    );

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
        model:
          "A-MRCI implementation based on automation-oriented published rules; requires local validation before clinical/research deployment."
      }
    };
  });

  return totalsFromBreakdown("aMrci", breakdown);
}

// NOTE: This configurable A-MRCI mapping follows published automation-oriented logic.
// It should be locally validated before use in production clinical/research workflows.
export const aMrciDosageForms = {
  sectionWeights: {
    oral_simple: 1,
    oral_liquid: 1,
    inhaled: 2,
    injectable: 2,
    topical_or_transdermal: 2,
    ophthalmic_otologic: 2,
    device_complex: 3,
    unknown: 1
  },
  aliasesFromClassic: {
    tablet_or_capsule_or_pill: "oral_simple",
    liquid_or_solution_or_suspension: "oral_liquid",
    inhaler_or_nebulizer: "inhaled",
    injection: "injectable",
    topical_patch: "topical_or_transdermal",
    eye_or_ear_drop: "ophthalmic_otologic",
    subcutaneous_device: "device_complex",
    complex_device: "device_complex",
    unknown: "unknown"
  }
};

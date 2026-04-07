// NOTE: This configurable A-MRCI mapping follows published automation-oriented logic.
// It should be locally validated before use in production clinical/research workflows.
export const aMrciAdditionalDirections = {
  sectionWeights: {
    food_related: 0.5,
    special_handling: 1,
    variable_schedule: 1,
    device_technique: 0.5,
    none: 0
  },
  aliasesFromClassic: {
    with_food: "food_related",
    without_food: "food_related",
    split_or_crush_or_mix: "special_handling",
    taper_or_variable_schedule: "variable_schedule",
    specific_time_of_day: "special_handling",
    inhaler_technique: "device_technique",
    monitoring_or_special_instruction: "special_handling",
    none: "none"
  }
};

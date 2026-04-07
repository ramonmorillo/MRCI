// NOTE: This configurable A-MRCI mapping follows published automation-oriented logic.
// It should be locally validated before use in production clinical/research workflows.
export const aMrciFrequencies = {
  sectionWeights: {
    daily_or_less: 1,
    twice_daily: 1.5,
    three_plus_daily: 2,
    weekly_or_monthly: 0.5,
    prn_modifier: 0.25,
    alternating_modifier: 0.5,
    unknown: 1
  },
  aliasesFromClassic: {
    once_daily: "daily_or_less",
    twice_daily: "twice_daily",
    three_times_daily: "three_plus_daily",
    four_times_daily: "three_plus_daily",
    every_6_hours: "three_plus_daily",
    every_4_hours: "three_plus_daily",
    weekly: "weekly_or_monthly",
    monthly: "weekly_or_monthly",
    unknown: "unknown"
  }
};

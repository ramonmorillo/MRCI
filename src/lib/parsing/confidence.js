export function makeField(value = "", confidence = "low", evidence = "", flags = []) {
  const uncertain = confidence === "low" || !value;
  return {
    value,
    confidence,
    evidence,
    uncertain,
    needsManualReview: uncertain,
    flags
  };
}

export function confidenceFromEvidence(value, evidence, strongPattern = false) {
  if (!value) return "low";
  if (strongPattern && evidence) return "high";
  if (evidence) return "medium";
  return "low";
}

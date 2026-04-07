export function normalizeText(value = "") {
  return value.trim().toLowerCase();
}

export function resolveAlias(aliasMap, value, fallback = "unknown") {
  return aliasMap[normalizeText(value)] ?? fallback;
}

export function extractDirectionKeys(keywords, raw = "") {
  const lower = normalizeText(raw);
  if (!lower) return ["none"];
  const keys = Object.entries(keywords || {})
    .filter(([phrase]) => lower.includes(phrase))
    .map(([, key]) => key);
  return keys.length ? [...new Set(keys)] : ["none"];
}

export function hasAlternating(frequency, instructions) {
  const text = `${frequency} ${instructions}`.toLowerCase();
  return text.includes("alternate") || text.includes("alternating");
}

export function buildTotals(engine, breakdown, warnings = []) {
  const subtotalA = Number(breakdown.reduce((sum, row) => sum + row.sectionA, 0).toFixed(2));
  const subtotalB = Number(breakdown.reduce((sum, row) => sum + row.sectionB, 0).toFixed(2));
  const subtotalC = Number(breakdown.reduce((sum, row) => sum + row.sectionC, 0).toFixed(2));
  return {
    engine,
    subtotalA,
    subtotalB,
    subtotalC,
    total: Number((subtotalA + subtotalB + subtotalC).toFixed(2)),
    breakdown,
    warnings
  };
}

export function warning(type, field, message, medicationId, medicationName) {
  return { type, field, message, medicationId, medicationName, needsManualReview: true };
}

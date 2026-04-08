export function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

export function normalizeMedicationRow(medication = {}) {
  const normalized = {
    id: medication.id || crypto.randomUUID(),
    drugName: String(medication.drugName || "").trim(),
    dosageFormRoute: String(medication.dosageFormRoute || medication.dosageForm || "").trim(),
    dosageForm: String(medication.dosageForm || "").trim(),
    route: String(medication.route || "").trim(),
    frequency: String(medication.frequency || "").trim(),
    prn: Boolean(medication.prn),
    additionalInstructions: String(medication.additionalInstructions || "").trim(),
    validated: Boolean(medication.validated)
  };

  const inferred = [];
  if (!medication.dosageFormRoute && medication.dosageForm) {
    inferred.push("dosageFormRoute<-dosageForm");
  }

  return { normalized, inferred };
}

export function resolveAlias(aliasMap, value, fallback = "unknown") {
  return aliasMap[normalizeText(value)] ?? fallback;
}

export function extractDirectionKeys(keywords, raw = "") {
  const lower = normalizeText(raw);
  if (!lower) return ["none"];

  const separated = lower
    .split(/[;,\n]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const keys = Object.entries(keywords || {})
    .filter(([phrase]) => lower.includes(phrase) || separated.includes(phrase))
    .map(([, key]) => key);

  return keys.length ? [...new Set(keys)] : ["none"];
}

export function hasAlternating(frequency, instructions) {
  const text = `${frequency} ${instructions}`.toLowerCase();
  return text.includes("alternate") || text.includes("alternating") || text.includes("alterno") || text.includes("alternante");
}

export function buildTotals(engine, breakdown, warnings = [], debugRows = []) {
  const subtotalA = Number(breakdown.reduce((sum, row) => sum + row.sectionA, 0).toFixed(2));
  const subtotalB = Number(breakdown.reduce((sum, row) => sum + row.sectionB, 0).toFixed(2));
  const subtotalC = Number(breakdown.reduce((sum, row) => sum + row.sectionC, 0).toFixed(2));
  const total = Number((subtotalA + subtotalB + subtotalC).toFixed(2));
  return {
    engine,
    subtotalA,
    subtotalB,
    subtotalC,
    total,
    breakdown,
    warnings,
    debug: {
      rows: debugRows,
      subtotals: { subtotalA, subtotalB, subtotalC, total }
    }
  };
}

export function warning(type, field, message, medicationId, medicationName, meta = {}) {
  return { type, field, message, medicationId, medicationName, needsManualReview: true, ...meta };
}

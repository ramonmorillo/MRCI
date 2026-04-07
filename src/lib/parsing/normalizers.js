import { DOSAGE_FORM_KEYWORDS, ROUTE_KEYWORDS } from "./patterns.js";

function lookupKeyword(text, map) {
  const lower = text.toLowerCase();
  return Object.entries(map).find(([, keywords]) => keywords.some((word) => lower.includes(word)))?.[0] || "";
}

export function normalizeDosageForm(text = "") {
  return lookupKeyword(text, DOSAGE_FORM_KEYWORDS);
}

export function normalizeRoute(text = "") {
  return lookupKeyword(text, ROUTE_KEYWORDS);
}

export function normalizeFrequencyKey(value = "") {
  const v = value.toLowerCase().trim();
  if (!v) return "";
  if (["od", "qd", "daily"].includes(v)) return "daily";
  if (["bid", "q12h"].includes(v)) return "bid";
  if (["tid", "q8h"].includes(v)) return "tid";
  if (["qid", "q6h"].includes(v)) return "qid";
  return v;
}

export function cleanDrugName(value = "") {
  return value.replace(/\s+/g, " ").replace(/[,:;]+$/, "").trim();
}

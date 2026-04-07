import { lookupAlias, normalizeText } from "../configLoader.js";

export function directionKeys(additionalDirections, raw = "") {
  const lower = normalizeText(raw);
  if (!lower) return ["none"];
  const keys = [];
  for (const [phrase, key] of Object.entries(additionalDirections.keywords || {})) {
    if (lower.includes(phrase)) keys.push(key);
  }
  return keys.length ? [...new Set(keys)] : ["none"];
}

export function hasAlternating(frequency, instructions) {
  const text = `${frequency} ${instructions}`.toLowerCase();
  return text.includes("alternate") || text.includes("alternating");
}

export function resolveFormKey(dosageForms, dosageFormRoute) {
  return lookupAlias(dosageForms.aliases || {}, dosageFormRoute, "unknown");
}

export function resolveFrequencyKey(frequencies, frequency) {
  return lookupAlias(frequencies.aliases || {}, frequency, "unknown");
}

import { aMrciMappings } from "./lib/scoring/aMrci.js";
import { mrciClassicMappings } from "./lib/scoring/mrciClassic.js";

export async function loadMappings() {
  return {
    mrciClassic: mrciClassicMappings,
    aMrci: aMrciMappings
  };
}

export function normalizeText(value = "") {
  return value.trim().toLowerCase();
}

export function lookupAlias(aliasMap, value, fallback = "unknown") {
  const key = normalizeText(value);
  return aliasMap[key] ?? fallback;
}

import { en } from "./i18n/en.js";
import { es } from "./i18n/es.js";

const messages = { en, es };
const missingKeys = new Set();

function resolveKey(obj, keyPath) {
  return keyPath.split(".").reduce((acc, part) => (acc && part in acc ? acc[part] : undefined), obj);
}

export function t(lang = "en", key, vars = {}) {
  const chosen = messages[lang] || messages.en;
  let value = resolveKey(chosen, key);
  if (value === undefined) {
    value = resolveKey(messages.en, key);
    const marker = `${lang}:${key}`;
    if (!missingKeys.has(marker)) {
      missingKeys.add(marker);
      console.warn(`[i18n] Missing translation for '${key}' in '${lang}', fallback to English.`);
    }
  }
  if (value === undefined) return key;
  if (typeof value !== "string") return value;
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), value);
}

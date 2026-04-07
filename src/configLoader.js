const paths = {
  dosageForms: "./config/dosageForms.json",
  frequencies: "./config/frequencies.json",
  additionalDirections: "./config/additionalDirections.json"
};

export async function loadMappings() {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([k, path]) => {
      const data = await fetch(path).then((r) => r.json());
      return [k, data];
    })
  );
  return Object.fromEntries(entries);
}

export function normalizeText(value = "") {
  return value.trim().toLowerCase();
}

export function lookupAlias(aliasMap, value, fallback = "unknown") {
  const key = normalizeText(value);
  return aliasMap[key] ?? fallback;
}

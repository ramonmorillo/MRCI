function tokenize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function scoreFieldMatch(source, query) {
  if (!source || !query) return 0;
  if (source === query) return 120;
  if (source.startsWith(query)) return 80;
  if (source.includes(query)) return 40;
  return 0;
}

export function filterAndRankCimaResults(items = [], query = "") {
  const normalizedQuery = tokenize(query);
  if (!normalizedQuery) return [];

  return items
    .map((item) => {
      const name = tokenize(item.name);
      const activeIngredients = tokenize(item.activeIngredients);
      const form = tokenize(item.form);
      const registration = tokenize(item.registrationNumber);
      const nationalCode = tokenize(item.nationalCode);

      const score =
        scoreFieldMatch(name, normalizedQuery) +
        scoreFieldMatch(activeIngredients, normalizedQuery) +
        scoreFieldMatch(form, normalizedQuery) +
        scoreFieldMatch(registration, normalizedQuery) +
        scoreFieldMatch(nationalCode, normalizedQuery);

      return { ...item, _score: score };
    })
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)));
}

export function highlightMatch(text = "", query = "") {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return value;
  const index = value.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return value;
  return `${value.slice(0, index)}<mark>${value.slice(index, index + needle.length)}</mark>${value.slice(index + needle.length)}`;
}

export function createDebouncedSearch({
  minLength = 3,
  waitMs = 350,
  searchFn,
  onState,
  debounceFactory = (fn, delay) => {
    let timer = null;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
}) {
  let sequence = 0;

  const run = debounceFactory(async (query, context) => {
    const normalized = String(query || "").trim();
    const currentSeq = ++sequence;

    if (normalized.length < minLength) {
      onState({ type: "idle", query: normalized, results: [] }, context);
      return;
    }

    onState({ type: "loading", query: normalized, results: [] }, context);
    try {
      const results = await searchFn(normalized, context);
      if (currentSeq !== sequence) return;
      onState({ type: "success", query: normalized, results }, context);
    } catch (error) {
      if (currentSeq !== sequence) return;
      onState({ type: "error", query: normalized, error, results: [] }, context);
    }
  }, waitMs);

  return { run };
}

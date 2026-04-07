const CIMA_BASE_URL = "https://cima.aemps.es/cima/rest";
const CACHE_KEY = "mrci.cima.cache.v1";
const CACHE_TTL_MS = 1000 * 60 * 30;

function now() {
  return Date.now();
}

function safeStorage() {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function readCache() {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(CACHE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function fromCache(key) {
  const cache = readCache();
  const entry = cache[key];
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    delete cache[key];
    writeCache(cache);
    return null;
  }
  return entry.value;
}

function toCache(key, value, ttlMs = CACHE_TTL_MS) {
  const cache = readCache();
  cache[key] = { value, expiresAt: now() + ttlMs };
  const activeEntries = Object.entries(cache).filter(([, entry]) => entry.expiresAt > now());
  const trimmed = Object.fromEntries(activeEntries.slice(-50));
  writeCache(trimmed);
}

function request(path, { fetchImpl = fetch, useCache = true } = {}) {
  const url = `${CIMA_BASE_URL}${path}`;
  const cacheKey = `GET:${url}`;
  if (useCache) {
    const cached = fromCache(cacheKey);
    if (cached) return Promise.resolve(cached);
  }

  return fetchImpl(url)
    .then((res) => {
      if (!res.ok) throw new Error(`CIMA API error ${res.status}`);
      return res.json();
    })
    .then((payload) => {
      if (useCache) toCache(cacheKey, payload);
      return payload;
    });
}

function normalizeSearchResponse(items = []) {
  return items.map((item) => ({
    id: `${item.nregistro || ""}:${item.nombre || ""}`,
    name: item.nombre || "",
    activeIngredients: item.pactivos || "",
    registrationNumber: item.nregistro || "",
    form: item.formaFarmaceutica?.nombre || item.formaFarmaceuticaSimplificada?.nombre || "",
    route: item.viasAdministracion?.map((v) => v.nombre).filter(Boolean).join(", ") || "",
    dose: item.dosis || ""
  }));
}

function normalizePresentation(items = []) {
  return items.map((item) => ({
    nationalCode: item.cn || "",
    name: item.nombre || "",
    supplyIssue: item.psum || false,
    marketed: item.comerc ?? null
  }));
}

export async function searchMedications(query, { type = "name", fetchImpl = fetch } = {}) {
  const text = String(query || "").trim();
  if (!text) return [];
  const params = new URLSearchParams();
  if (type === "ingredient") params.set("pactivos", text);
  else if (type === "nationalCode") params.set("cn", text);
  else if (type === "registration") params.set("nregistro", text);
  else params.set("nombre", text);

  const path = `/medicamentos?${params.toString()}`;
  const data = await request(path, { fetchImpl });
  return normalizeSearchResponse(data.resultados || data || []);
}

export async function getMedicationDetail({ registrationNumber, nationalCode, fetchImpl = fetch }) {
  const params = new URLSearchParams();
  if (registrationNumber) params.set("nregistro", registrationNumber);
  if (nationalCode) params.set("cn", nationalCode);
  const data = await request(`/medicamento?${params.toString()}`, { fetchImpl });
  return data;
}

export async function getPresentationDetail({ nationalCode, registrationNumber, fetchImpl = fetch }) {
  const params = new URLSearchParams();
  if (nationalCode) params.set("cn", nationalCode);
  if (registrationNumber) params.set("nregistro", registrationNumber);
  const data = await request(`/presentaciones?${params.toString()}`, { fetchImpl });
  return normalizePresentation(data.resultados || data || []);
}

export async function getSafetyNotes(registrationNumber, { fetchImpl = fetch } = {}) {
  if (!registrationNumber) return [];
  const data = await request(`/notas?nregistro=${encodeURIComponent(registrationNumber)}`, { fetchImpl });
  return data.resultados || data || [];
}

export async function getSupplyIssues(nationalCode, { fetchImpl = fetch } = {}) {
  if (!nationalCode) return [];
  const data = await request(`/psuministro/${encodeURIComponent(nationalCode)}`, { fetchImpl });
  return data.resultados || data || [];
}

export const __internal = { normalizeSearchResponse, normalizePresentation, fromCache, toCache };

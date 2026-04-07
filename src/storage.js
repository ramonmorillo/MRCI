const ACTIVE_KEY = "mrci-session-v1";
const SNAPSHOT_KEY = "mrci-session-snapshots-v1";

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveSession(session) {
  const copy = { ...session, updatedAt: new Date().toISOString() };
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(copy));
  return copy;
}

export function loadSession() {
  return readJson(ACTIVE_KEY, null);
}

export function saveSnapshot(session, label = "") {
  const snapshots = readJson(SNAPSHOT_KEY, []);
  const snapshot = {
    id: crypto.randomUUID(),
    label: label.trim() || `Session ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    session: { ...session, updatedAt: new Date().toISOString() }
  };
  snapshots.unshift(snapshot);
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, 20)));
  return snapshot;
}

export function listSnapshots() {
  return readJson(SNAPSHOT_KEY, []);
}

export function loadSnapshot(snapshotId) {
  const snapshots = readJson(SNAPSHOT_KEY, []);
  return snapshots.find((s) => s.id === snapshotId) ?? null;
}

export function resetStorage() {
  localStorage.removeItem(ACTIVE_KEY);
}

const KEY = "mrci-session-v1";

export function saveSession(session) {
  const copy = { ...session, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(copy));
  return copy;
}

export function loadSession() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

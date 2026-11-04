/* ---------- communication avec l'API du serveur (voir endpoints.md) ---------- */
class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** 409 : une autre connexion a modifié les données depuis leur chargement. */
const isConflict = error => error instanceof ApiError && error.status === 409;
const failureMessage = error => t(isConflict(error) ? "stateConflict" : "saveFailure");

/** Reçu à la connexion ; à renvoyer avec toute requête d'écriture. */
let csrfToken = "";

/** Envoie une requête JSON. `revision` est la révision connue, transmise dans If-Match. */
async function apiRequest(url, { method = "GET", body, revision } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (revision !== undefined) headers["If-Match"] = String(revision);
  if (method !== "GET") {
    if (!csrfToken && url !== "/api/auth/login") throw new ApiError("csrf_missing", 403);
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? "server_error", response.status);
  if (payload.csrfToken) csrfToken = payload.csrfToken;
  return payload;
}

const API = {
  currentUser: async () => {
    const result = await apiRequest("/api/auth/me");
    return result.user ? result : null;
  },
  login: (email, password) => apiRequest("/api/auth/login", { method: "POST", body: { email, password } }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  getState: () => apiRequest("/api/state"),
  saveState: (active, revision) => apiRequest("/api/state", { method: "PUT", body: { active }, revision }),
  archive: revision => apiRequest("/api/archive", { method: "POST", body: {}, revision }),
  getMandate: () => apiRequest("/api/mandate"),
  saveMandate: (mandate, mode, revision) => apiRequest("/api/mandate", { method: "PUT", body: { ...mandate, mode }, revision }),
};

/* ---------- communication avec l'API du serveur ---------- */
class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

let csrfToken = "";

async function apiRequest(url, options = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfToken && url !== "/api/auth/login") throw new ApiError("csrf_missing", 403);
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  login: (email, password) => apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password },
  }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  getState: () => apiRequest("/api/state"),
  saveState: (active, revision) => apiRequest("/api/state", {
    method: "PUT",
    headers: { "If-Match": String(revision) },
    body: { active },
  }),
  archive: revision => apiRequest("/api/archive", {
    method: "POST",
    headers: { "If-Match": String(revision) },
    body: {},
  }),
  importState: (active, history, revision) => apiRequest("/api/state/import", {
    method: "PUT",
    headers: { "If-Match": String(revision) },
    body: { active, history },
  }),
};

/* ---------- connexion, déconnexion et verrouillage après inactivité ---------- */
/**
 * Déconnexion après 10 minutes sans action. La session serveur expire elle aussi
 * après 10 minutes sans requête : tant que l'utilisateur agit, le navigateur la
 * prolonge au plus une fois par KEEP_ALIVE_INTERVAL, même sans rien enregistrer.
 */
const IDLE_TIMEOUT = 10 * 60 * 1000;
const KEEP_ALIVE_INTERVAL = 60 * 1000;
let idleTimer;
let lastActivity = 0;
let lastKeepAlive = 0;

function setLocked(locked) {
  clearTimeout(idleTimer);
  elevatedUntil = 0;
  document.getElementById("reauth-dialog").close();
  document.body.classList.toggle("locked", locked);
  if (locked) document.getElementById("email").focus();
  else { sanitize(); render(); resetIdleTimeout(); }
}

function resetIdleTimeout() {
  clearTimeout(idleTimer);
  lastActivity = lastKeepAlive = Date.now();
  idleTimer = setTimeout(logout, IDLE_TIMEOUT);
}

/** Une action de l'utilisateur repousse la déconnexion et, si besoin, l'expiration de la session serveur. */
function recordActivity() {
  const now = Date.now();
  // Un minuteur peut partir en retard (onglet en arrière-plan, mise en veille) : l'heure fait foi.
  if (now - lastActivity >= IDLE_TIMEOUT) return logout();
  lastActivity = now;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(logout, IDLE_TIMEOUT);
  if (now - lastKeepAlive < KEEP_ALIVE_INTERVAL) return;
  lastKeepAlive = now;
  API.currentUser().then(user => {
    if (!user && !document.body.classList.contains("locked")) {
      setLocked(true);
      document.getElementById("login-error").textContent = t("sessionExpired");
    }
  }).catch(() => {}); // serveur injoignable : le prochain enregistrement le signalera
}

async function login(form) {
  const err = document.getElementById("login-error");
  try {
    await API.login(form.elements.email.value.trim(), form.elements.password.value);
    await loadServerState();
    form.reset();
    err.textContent = "";
    setLocked(false);
  } catch (error) {
    err.textContent = error instanceof ApiError && error.status === 401 ? t("loginBad") : t("loginServerUnavailable");
  }
}

/** Au chargement de la page, reprend la session serveur si elle est encore ouverte. */
async function restoreLogin() {
  if (!await API.currentUser()) return;
  await loadServerState();
  setLocked(false);
}

/** Attend la fin des enregistrements pour pouvoir signaler une perte de données. */
async function logout() {
  const saved = await saveQueue;
  let logoutFailed = false;
  try {
    await API.logout();
  } catch {
    logoutFailed = true;
  } finally {
    setLocked(true);
  }
  document.getElementById("login-error").textContent = !saved || saveError
    ? t("saveFailure")
    : logoutFailed ? t("logoutServerError") : "";
}

/* ---------- authentification renforcée, demandée avant une suppression ---------- */
/** Fin de validité annoncée par le serveur, moins une marge : un refus en cours d'enregistrement bloquerait la page. */
let elevatedUntil = 0;
const ELEVATION_MARGIN = 30 * 1000;
/** Fonction qui conclut la demande en cours ; null si la fenêtre est fermée. */
let elevationRequest = null;

/** Redemande le mot de passe si besoin ; true si le serveur l'a accepté. */
function requireElevation() {
  if (Date.now() < elevatedUntil) return Promise.resolve(true);
  const dialog = document.getElementById("reauth-dialog");
  dialog.querySelector("form").reset();
  document.getElementById("reauth-error").textContent = "";
  dialog.showModal();
  return new Promise(resolve => { elevationRequest = resolve; });
}

async function confirmElevation(form) {
  const err = document.getElementById("reauth-error");
  try {
    const result = await API.elevate(form.elements.password.value);
    elevatedUntil = Date.now() + result.expiresInSeconds * 1000 - ELEVATION_MARGIN;
    const resolve = elevationRequest;
    elevationRequest = null;
    document.getElementById("reauth-dialog").close();
    resolve?.(true);
  } catch (error) {
    form.elements.password.value = "";
    err.textContent = error instanceof ApiError && error.status === 401 ? t("reauthBad")
      : error instanceof ApiError && error.status === 429 ? t("reauthTooMany")
      : t("loginServerUnavailable");
  }
}

// Fermer la fenêtre (Annuler, Échap, déconnexion) refuse la suppression demandée.
document.getElementById("reauth-dialog").addEventListener("close", () => {
  elevationRequest?.(false);
  elevationRequest = null;
});

// Écouteurs passifs : le défilement n'attend pas leur exécution.
["pointerdown", "keydown", "input", "touchstart", "wheel", "scroll"].forEach(eventName => {
  document.addEventListener(eventName, () => {
    if (!document.body.classList.contains("locked")) recordActivity();
  }, { passive: true, capture: true });
});
// Au retour sur un onglet resté caché plus de 10 minutes, la déconnexion se fait tout de suite.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !document.body.classList.contains("locked")
    && Date.now() - lastActivity >= IDLE_TIMEOUT) logout();
});

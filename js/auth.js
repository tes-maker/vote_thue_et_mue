/* ---------- connexion, déconnexion et verrouillage après inactivité ---------- */
/** Déconnexion côté navigateur ; la session serveur, elle, expire après 8 h sans requête. */
const IDLE_TIMEOUT = 15 * 60 * 1000;
let idleTimer;

function setLocked(locked) {
  clearTimeout(idleTimer);
  document.body.classList.toggle("locked", locked);
  if (locked) document.getElementById("email").focus();
  else { sanitize(); render(); resetIdleTimeout(); }
}

function resetIdleTimeout() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(logout, IDLE_TIMEOUT);
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

["pointerdown", "keydown", "input", "touchstart", "wheel", "scroll"].forEach(eventName => {
  document.addEventListener(eventName, () => {
    if (!document.body.classList.contains("locked")) resetIdleTimeout();
  });
});

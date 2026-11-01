/* ---------- authentification par compte serveur ---------- */
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
    err.textContent = error instanceof ApiError && error.status === 401
      ? t("loginBad")
      : error.message === t("loginDataError") ? error.message : t("loginServerUnavailable");
  }
}

async function restoreLogin() {
  if (!await API.currentUser()) return;
  await loadServerState();
  setLocked(false);
}

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

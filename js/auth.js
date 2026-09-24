/* ---------- connexion par clé (empreinte dans config.js) ---------- */
const SESSION_KEY = "vote-cm-session";

async function sha256(txt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

function setLocked(locked) {
  document.body.classList.toggle("locked", locked);
  if (locked) document.getElementById("cle").focus();
  else { sanitize(); render(); }
}

async function login(form) {
  const err = document.getElementById("login-error");
  if (!window.crypto?.subtle) { err.textContent = t("loginNoCrypto"); return; }
  if (await sha256(form.elements.cle.value) === CLE_HASH) {
    try { sessionStorage.setItem(SESSION_KEY, CLE_HASH); } catch (e) {}
    form.reset();
    err.textContent = "";
    setLocked(false);
  } else {
    err.textContent = t("loginBad");
    form.elements.cle.select();
  }
}

function logout() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  setLocked(true);
}

function isLoggedIn() {
  try { return sessionStorage.getItem(SESSION_KEY) === CLE_HASH; } catch (e) { return false; }
}

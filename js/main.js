/* ---------- démarrage (dernier script chargé) ---------- */
applyStatic();
restoreLogin().catch(error => {
  console.error("Chargement de la séance impossible :", error);
  document.getElementById("login-error").textContent = t("loginServerUnavailable");
});

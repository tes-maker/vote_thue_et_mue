/* ---------- démarrage ---------- */
applyStatic();
restoreLogin().catch(error => {
  console.error("Chargement de la séance impossible :", error);
  document.getElementById("login-error").textContent = error.message === t("loginDataError")
    ? error.message
    : t("loginServerUnavailable");
});

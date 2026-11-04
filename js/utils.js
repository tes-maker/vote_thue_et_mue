/* ---------- utilitaires ---------- */
/** Identifiant court, compatible avec le format imposé par le serveur (a-z, 0-9). */
const uid = () => Math.random().toString(36).slice(2, 10);
/** Date du jour au format AAAA-MM-JJ (UTC). */
const today = () => new Date().toISOString().slice(0, 10);
/** Échappe un texte inséré dans du HTML : toute donnée saisie doit passer par là. */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** AAAA-MM-JJ -> JJ/MM/AAAA */
const fmtDate = d => d ? d.split("-").reverse().join("/") : "";

/** Fait télécharger un contenu généré dans le navigateur. */
function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

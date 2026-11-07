/* ---------- utilitaires ---------- */
/**
 * Identifiant aléatoire de 16 caractères, au format imposé par le serveur (a-z, 0-9).
 * crypto.getRandomValues fonctionne aussi hors HTTPS, contrairement à randomUUID.
 */
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => (byte % 36).toString(36)).join("");
/** Date du jour au format AAAA-MM-JJ, dans le fuseau du poste (et non en UTC). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
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

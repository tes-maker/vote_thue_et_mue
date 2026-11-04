/* ---------- calcul du résultat d'un vote nominal ---------- */
/** Choix d'un électeur ; sans choix enregistré, il vote « pour ». */
const choice = (v, id) => CHOIX.includes(v.choix[id]) ? v.choix[id] : "pour";

/**
 * Décompte d'une délibération d'après ses électeurs figés.
 * - res : clé de traduction du résultat (res_*)
 * - ok : true adopté, false rejeté, null aucun suffrage exprimé
 * Abstentions et non-participations ne comptent pas dans la majorité.
 */
function tally(v) {
  const r = { pour: 0, contre: 0, abst: 0, npp: 0 };
  v.electeurs.forEach(e => r[choice(v, e.id)]++);
  r.votants = r.pour + r.contre + r.abst;
  if (r.pour + r.contre === 0) { r.ok = null; r.res = "res_none"; }
  else if (r.pour !== r.contre) {
    r.ok = r.pour > r.contre;
    r.res = !r.ok ? "res_rejected" : r.contre || r.abst ? "res_adopted" : "res_unanimous";
  } else {
    // Égalité : la voix du président de séance est prépondérante, s'il a voté pour ou contre.
    const c = v.electeurs.some(e => e.id === v.president) ? choice(v, v.president) : null;
    r.ok = c === "pour";
    r.res = c === "pour" ? "res_adoptedCasting" : c === "contre" ? "res_rejectedCasting" : "res_rejectedTie";
  }
  return r;
}

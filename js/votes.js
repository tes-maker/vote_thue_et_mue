/* ---------- calcul des votes ---------- */
const choice = (v, id) => CHOIX.includes(v.choix[id]) ? v.choix[id] : "pour";

// Décompte d'une délibération ; res est une clé de traduction (res_*)
function tally(v, vs = voters()) {
  const r = { pour: 0, contre: 0, abst: 0, npp: 0 };
  vs.forEach(e => r[choice(v, e.id)]++);
  r.votants = r.pour + r.contre + r.abst;
  if (r.pour + r.contre === 0) { r.ok = null; r.res = "res_none"; }
  else if (r.pour !== r.contre) {
    r.ok = r.pour > r.contre;
    r.res = !r.ok ? "res_rejected" : r.contre || r.abst ? "res_adopted" : "res_unanimous";
  } else {
    // Égalité : la voix du président de séance est prépondérante
    const c = vs.some(e => e.id === S.seance.president) ? choice(v, S.seance.president) : null;
    r.ok = c === "pour";
    r.res = c === "pour" ? "res_adoptedCasting" : c === "contre" ? "res_rejectedCasting" : "res_rejectedTie";
  }
  return r;
}

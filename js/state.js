/* ---------- état de la séance (enregistré dans le navigateur) ---------- */
const ID_RE = /^[a-z0-9]+$/;

function fresh(elus = DEFAULT_ELUS.map(([nom, fonction]) => ({ id: uid(), nom, fonction }))) {
  return { elus, seance: { titre: "Conseil municipal", date: today(), president: elus[0]?.id ?? null }, presence: {}, votes: [] };
}

// Vérifie et complète des données venant du navigateur ou d'un fichier ; null si invalides.
function normalize(s) {
  if (!s || !Array.isArray(s.elus) || !s.elus.every(e => ID_RE.test(e?.id))) return null;
  const votes = Array.isArray(s.votes) ? s.votes.filter(v => ID_RE.test(v?.id)) : [];
  return {
    elus: s.elus.map(e => ({ id: e.id, nom: String(e.nom ?? ""), fonction: String(e.fonction ?? "") })),
    seance: { ...fresh(s.elus).seance, ...(typeof s.seance === "object" ? s.seance : {}) },
    presence: s.presence && typeof s.presence === "object" ? s.presence : {},
    votes: votes.map(v => ({ id: v.id, numero: String(v.numero ?? ""), objet: String(v.objet ?? ""), choix: v.choix || {} })),
  };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))) || fresh(); } catch (e) { return fresh(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

let S = load();

/* ---------- présences et procurations ---------- */
const byId = id => S.elus.find(e => e.id === id);
const pres = id => S.presence[id];
const isPresent = id => pres(id).present;
const isVoter = e => isPresent(e.id) || !!pres(e.id).mandataire;
const voters = () => S.elus.filter(isVoter);
const statut = e => t(isPresent(e.id) ? "present" : pres(e.id).mandataire ? "represented" : "absent");

// Porteur de procuration -> élu absent qu'il représente
function proxies() {
  const m = new Map();
  S.elus.forEach(e => { const h = pres(e.id).mandataire; if (h) m.set(h, e); });
  return m;
}

function counts() {
  const n = S.elus.length;
  const p = S.elus.filter(e => isPresent(e.id)).length;
  const r = proxies().size;
  const quorum = Math.floor(n / 2) + 1;
  return { n, p, r, a: n - p - r, quorum, quorumOk: p >= quorum };
}

// Garde la cohérence : chaque élu a une présence, procuration uniquement vers un présent, une seule par présent.
function sanitize() {
  S.elus.forEach(e => {
    const p = S.presence[e.id];
    S.presence[e.id] = { present: p?.present !== false, mandataire: p?.mandataire ?? null };
  });
  const held = new Set();
  S.elus.forEach(e => {
    const p = pres(e.id);
    const h = p.mandataire;
    if (p.present || !byId(h) || !isPresent(h) || held.has(h)) p.mandataire = null;
    else held.add(h);
  });
  if (!byId(S.seance.president)) S.seance.president = S.elus[0]?.id ?? null;
}
function commit() { sanitize(); save(); render(); }

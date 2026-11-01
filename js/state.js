/* ---------- état de la séance (enregistré sur le serveur) ---------- */
const ID_RE = /^[a-z0-9]+$/;
const validId = id => typeof id === "string" && ID_RE.test(id);
let revision = 0;
let saveQueue = Promise.resolve(true);
let saveError = null;

function fresh(elus = DEFAULT_ELUS.map(([nom, fonction]) => ({ id: uid(), nom, fonction, actif: true }))) {
  return { elus, seance: { id: uid(), titre: "Conseil municipal", date: today(), president: elus[0]?.id ?? null }, presence: {}, votes: [] };
}

// Vérifie et complète des données venant du navigateur ou d'un fichier ; null si invalides.
function normalize(s) {
  if (!s || !Array.isArray(s.elus) || !s.elus.every(e => validId(e?.id))) return null;
  const seance = typeof s.seance === "object" && s.seance ? s.seance : {};
  const elus = s.elus.map(e => ({
    id: e.id,
    nom: String(e.nom ?? ""),
    fonction: String(e.fonction ?? ""),
    actif: typeof e.actif === "boolean" ? e.actif : true,
  }));
  const presence = {};
  elus.forEach(e => {
    const p = s.presence?.[e.id];
    presence[e.id] = {
      present: e.actif && p?.present !== false,
      mandataire: e.actif && validId(p?.mandataire) ? p.mandataire : null,
    };
  });
  const votes = Array.isArray(s.votes) ? s.votes.filter(v => validId(v?.id)) : [];
  return {
    elus,
    seance: {
      id: validId(seance.id) ? seance.id : uid(),
      titre: String(seance.titre ?? "Conseil municipal"),
      date: String(seance.date ?? today()),
      president: seance.president ?? s.elus[0]?.id ?? null,
    },
    presence,
    votes: votes.map(v => ({
      id: v.id,
      numero: String(v.numero ?? ""),
      objet: String(v.objet ?? ""),
      choix: v.choix && typeof v.choix === "object" ? v.choix : {},
      electeurs: Array.isArray(v.electeurs)
        ? v.electeurs.filter(e => validId(e?.id)).map(e => ({
            id: e.id,
            nom: String(e.nom ?? ""),
            fonction: String(e.fonction ?? ""),
            actif: typeof e.actif === "boolean" ? e.actif : true,
            present: e.present !== false,
            mandataire: validId(e.mandataire) ? e.mandataire : null,
          }))
        : elus.filter(e => presence[e.id].present || presence[e.id].mandataire).map(e => ({
            ...e,
            ...presence[e.id],
          })),
      president: validId(v.president) ? v.president : seance.president ?? null,
    })),
  };
}

function normalizeArchives(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const snapshot = normalize(entry?.snapshot);
    if (!snapshot) return [];
    const archivedAt = typeof entry?.archivedAt === "string" && !Number.isNaN(Date.parse(entry.archivedAt))
      ? new Date(entry.archivedAt).toISOString() : new Date(0).toISOString();
    return [{ id: snapshot.seance.id, archivedAt, snapshot }];
  });
}

function readLegacyState() {
  let activeText;
  let historyText;
  try {
    activeText = localStorage.getItem(KEY);
    historyText = localStorage.getItem(HISTORY_KEY);
  } catch {
    throw new Error(t("loginDataError"));
  }
  if (activeText === null && historyText === null) return null;

  let active;
  let history;
  try {
    active = activeText === null ? normalize(fresh()) : normalize(JSON.parse(activeText));
    const parsedHistory = historyText === null ? [] : JSON.parse(historyText);
    history = normalizeArchives(parsedHistory);
    if (historyText !== null && (!Array.isArray(parsedHistory) || history.length !== parsedHistory.length)) {
      throw new Error(t("loginDataError"));
    }
  } catch {
    throw new Error(t("loginDataError"));
  }
  if (!active) throw new Error(t("loginDataError"));
  return { active, history };
}

async function loadServerState() {
  let remote = await API.getState();
  if (!remote.active) {
    const legacy = readLegacyState();
    const active = legacy?.active ?? normalize(fresh());
    try {
      if (legacy) await API.importState(active, legacy.history, remote.revision);
      else await API.saveState(active, remote.revision);
      remote = await API.getState();
      if (legacy) {
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem(HISTORY_KEY);
        } catch {
          showNotification(t("legacyCopyRemains"), "error");
        }
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      remote = await API.getState();
      if (legacy) showNotification(t("migrationConflict"), "error");
    }
  }
  S = normalize(remote.active);
  ARCHIVES = normalizeArchives(remote.history);
  if (!S || ARCHIVES.length !== remote.history.length) throw new Error(t("loginDataError"));
  revision = remote.revision;
  saveError = null;
  saveQueue = Promise.resolve(true);
  setSaveStatus("serverSaved");
  sanitize();
}

let S = fresh();
let ARCHIVES = [];

/* ---------- présences et procurations ---------- */
const byId = id => S.elus.find(e => e.id === id);
const pres = id => S.presence[id];
const isPresent = id => pres(id).present;
const isVoter = e => e.actif && (isPresent(e.id) || !!pres(e.id).mandataire);
const voters = () => S.elus.filter(isVoter);
const voteVoters = v => v.electeurs;
const voteSession = v => ({ president: v.president });
const statut = e => t(isPresent(e.id) ? "present" : pres(e.id).mandataire ? "represented" : "absent");

// Porteur de procuration -> élus absents qu'il représente
function proxies() {
  const m = new Map();
  S.elus.forEach(e => {
    const h = pres(e.id).mandataire;
    if (h && byId(h)) {
      const members = m.get(h) ?? [];
      members.push(e);
      m.set(h, members);
    }
  });
  return m;
}

function counts() {
  const active = S.elus.filter(e => e.actif);
  const n = active.length;
  const p = active.filter(e => isPresent(e.id)).length;
  const r = active.filter(e => !isPresent(e.id) && !!pres(e.id).mandataire).length;
  const quorum = Math.floor(n / 2) + 1;
  return { n, p, r, a: n - p - r, quorum, quorumOk: p >= quorum };
}

// Garde la cohérence : chaque élu a une présence, et la procuration ne peut être donnée qu'à un élu présent.
function sanitize() {
  S.elus.forEach(e => {
    const p = S.presence[e.id];
    S.presence[e.id] = e.actif
      ? { present: p?.present !== false, mandataire: p?.mandataire ?? null }
      : { present: false, mandataire: null };
  });
  S.elus.forEach(e => {
    const p = pres(e.id);
    const h = p.mandataire;
    if (p.present || !byId(h)?.actif || !isPresent(h)) p.mandataire = null;
  });
  if (!byId(S.seance.president)?.actif) S.seance.president = S.elus.find(e => e.actif)?.id ?? null;
}
function commit() {
  sanitize();
  render();
  const snapshot = JSON.parse(JSON.stringify(S));
  setSaveStatus("serverSaving");
  const pending = saveQueue.then(async () => {
    if (saveError) return false;
    try {
      const result = await API.saveState(snapshot, revision);
      revision = result.revision;
      if (pendingSaves > 0) pendingSaves--;
      if (pendingSaves === 0) setSaveStatus("serverSaved");
      return true;
    } catch (error) {
      saveError = error;
      pendingSaves = 0;
      setSaveStatus("saveFailure");
      showNotification(
        error instanceof ApiError && error.status === 409 ? t("stateConflict") : t("saveFailure"),
        "error",
      );
      return false;
    }
  });
  saveQueue = pending;
  pendingSaves++;
  return pending;
}

let pendingSaves = 0;

function setSaveStatus(key) {
  const status = document.getElementById("save-status");
  if (!status) return;
  status.textContent = t(key);
  status.classList.toggle("error", key === "saveFailure");
}

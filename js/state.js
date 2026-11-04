/* ---------- état de la séance et enregistrement sur le serveur ----------
   S contient la séance en cours. Une action la modifie, puis appelle commit(). */
let S = null;
let ARCHIVES = [];
let MANDATE = null;

/** Révisions connues du serveur, renvoyées à chaque écriture (voir If-Match dans endpoints.md). */
let revision = 0;
let mandateRevision = 0;

/** Promesse du dernier enregistrement : true s'il a réussi. */
let saveQueue = Promise.resolve(true);
/** Après un échec, plus rien n'est enregistré : les écritures suivantes écraseraient l'autre poste. */
let saveError = null;

/* ---------- création et chargement ---------- */

/** Nouvelle séance : tous les élus en exercice sont présents par défaut. */
function fresh(elus = DEFAULT_ELUS.map(([nom, fonction]) => ({ id: uid(), nom, fonction, actif: true }))) {
  return {
    elus,
    seance: { id: uid(), titre: "Conseil municipal", date: today(), president: elus[0]?.id ?? null },
    presence: Object.fromEntries(elus.map(e => [e.id, { present: e.actif, mandataire: null }])),
    votes: [],
    votesConfidentiels: [],
  };
}

/** Charge les données du serveur, qui les a validées, et crée la séance initiale sur une base vide. */
async function loadServerState() {
  let [remote, mandateRemote] = await Promise.all([API.getState(), API.getMandate()]);
  if (!remote.active) {
    // En cas de conflit, un autre poste vient d'initialiser la base : on reprend sa séance.
    await API.saveState(fresh(), remote.revision).catch(error => {
      if (!isConflict(error)) throw error;
    });
    remote = await API.getState();
  }
  S = remote.active;
  ARCHIVES = remote.history;
  revision = remote.revision;
  MANDATE = mandateRemote.mandate;
  mandateRevision = mandateRemote.revision;
  saveError = null;
  saveQueue = Promise.resolve(true);
  renderSaveStatus();
  sanitize();
}

/* ---------- présences et procurations ---------- */
const byId = id => S.elus.find(e => e.id === id);
const pres = id => S.presence[id];
const isPresent = id => pres(id).present;
/** Électeurs d'un nouveau vote : élus en exercice, présents ou représentés. */
const voters = () => S.elus.filter(e => e.actif && (isPresent(e.id) || !!pres(e.id).mandataire));

/** Porteur de procuration -> élus absents qu'il représente. */
function proxies() {
  const m = new Map();
  S.elus.forEach(e => {
    const h = pres(e.id).mandataire;
    if (h) m.set(h, [...(m.get(h) ?? []), e]);
  });
  return m;
}

/** Chiffres clés : le quorum, majorité des élus en exercice, ne tient compte que des présents. */
function counts() {
  const active = S.elus.filter(e => e.actif);
  const n = active.length;
  const p = active.filter(e => isPresent(e.id)).length;
  const r = active.filter(e => !isPresent(e.id) && !!pres(e.id).mandataire).length;
  const quorum = Math.floor(n / 2) + 1;
  return { n, p, r, a: n - p - r, quorum, quorumOk: p >= quorum };
}

/** Rétablit les règles après une modification : mêmes règles que server/schemas.js. */
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

/* ---------- enregistrement ---------- */

/**
 * Valide la modification de S et l'enregistre. Les enregistrements partent
 * l'un après l'autre, car chacun a besoin de la révision renvoyée par le précédent.
 */
function commit({ render: shouldRender = true } = {}) {
  sanitize();
  if (shouldRender) render();
  const snapshot = JSON.parse(JSON.stringify(S));
  saveQueue = saveQueue.then(async () => {
    if (saveError) return false;
    try {
      revision = (await API.saveState(snapshot, revision)).revision;
      return true;
    } catch (error) {
      saveError = error;
      renderSaveStatus();
      showNotification(failureMessage(error), "error");
      return false;
    }
  });
  return saveQueue;
}

/** Le statut n'apparaît qu'en cas d'échec ; un enregistrement réussi reste silencieux. */
function renderSaveStatus() {
  const status = document.getElementById("save-status");
  status.textContent = saveError ? t("saveFailure") : "";
  status.hidden = !saveError;
  status.classList.toggle("error", Boolean(saveError));
}

/* ---------- archives ---------- */
let archiveInProgress = false;

/** Archive la version enregistrée sur le serveur ; false si elle n'est pas à jour. */
async function archiveCurrentSession() {
  if (archiveInProgress) return false;
  archiveInProgress = true;
  try {
    if (!await saveQueue || saveError) return false;
    const result = await API.archive(revision);
    revision = result.revision;
    ARCHIVES = [...ARCHIVES.filter(item => item.id !== result.archive.id), result.archive];
    return true;
  } finally {
    archiveInProgress = false;
  }
}

/** Reprend une archive comme séance en cours, pour la corriger puis l'archiver à nouveau. */
function restoreArchive(id) {
  const entry = ARCHIVES.find(item => item.id === id);
  if (!entry || !confirm(t("historyRestoreConfirm"))) return;
  S = structuredClone(entry.snapshot);
  openVote = null;
  navigateToTab("votes");
  return commit();
}

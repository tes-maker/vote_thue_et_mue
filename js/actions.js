/* ---------- actions déclenchées par l'interface ----------
   Un seul écouteur par type d'événement (en fin de fichier) appelle le gestionnaire
   nommé par l'élément : data-act -> ON_CLICK, data-change -> ON_CHANGE,
   data-submit -> ON_SUBMIT. d = dataset de l'élément (data-id, data-val, data-vote…).
   Une action modifie S, puis appelle commit() pour afficher et enregistrer. */

const findVote = id => S.votes.find(v => v.id === id);
const findConfidentialVote = id => S.votesConfidentiels.find(v => v.id === id);
/** Texte saisi dans un champ de formulaire, sans les espaces de début et de fin. */
const field = (form, name) => form.elements[name].value.trim();

function showNotification(message, kind = "success") {
  const box = document.getElementById("notification");
  box.textContent = message;
  box.classList.toggle("error", kind === "error");
  box.classList.add("show");
  clearTimeout(showNotification.timer);
  showNotification.timer = setTimeout(() => box.classList.remove("show"), kind === "error" ? 12000 : 3000);
}

/** Prépare la fenêtre du mandat : "edit" corrige le mandat courant, "create" en démarre un nouveau. */
function setMandateForm(mode) {
  const creating = mode === "create";
  const form = document.querySelector('#mandate-dialog form[data-submit="saveMandate"]');
  form.dataset.mode = mode;
  form.elements.startYear.value = creating ? "" : MANDATE.startYear;
  form.elements.endYear.value = creating ? "" : MANDATE.endYear;
  document.getElementById("mandate-dialog-title").textContent = t(creating ? "mandateCreateTitle" : "mandateEditTitle");
  document.getElementById("mandate-dialog-description").textContent = t(creating ? "mandateCreateDescription" : "mandateEditDescription");
  document.getElementById("save-mandate").textContent = t(creating ? "saveNewMandate" : "saveMandateChanges");
}

const ON_CLICK = {
  tab: d => { navigateToTab(d.val); render(); },
  lang: d => setLang(d.val),
  themeToggle: () => toggleTheme(),
  logout: () => logout(),
  exportCSV: () => exportCSV(),
  exportJSON: () => exportJSON(),
  manageMandate: () => {
    setMandateForm("edit");
    document.getElementById("mandate-dialog").showModal();
  },
  editCurrentMandate: () => setMandateForm("edit"),
  newMandate: () => setMandateForm("create"),
  closeMandateDialog: () => document.getElementById("mandate-dialog").close(),
  archiveSession: async () => {
    if (!confirm(t("confirmArchiveCurrentSession"))) return;
    if (await archiveCurrentSession()) {
      showNotification(t("archiveSuccess"));
      render();
    }
  },
  editVoteTitle: d => {
    editingVoteTitle = { voteId: d.vote, type: d.type };
    render();
  },
  cancelVoteTitle: () => {
    editingVoteTitle = null;
    render();
  },
  restoreArchive: d => restoreArchive(d.id),

  present: d => { pres(d.id).present = d.val === "1"; commit(); },
  allPresent: d => { S.elus.filter(e => e.actif).forEach(e => { S.presence[e.id] = { present: d.val === "1", mandataire: null }; }); commit(); },
  newSeance: async () => {
    if (confirm(t("confirmNewSession")) && await archiveCurrentSession()) {
      S = fresh(S.elus);
      commit();
    }
  },

  toggleVote: d => { openVote = openVote === d.vote ? null : d.vote; render(); },
  delVote: d => { if (confirm(t("confirmDelItem"))) { S.votes = S.votes.filter(v => v.id !== d.vote); commit(); } },
  choice: d => { findVote(d.vote).choix[d.id] = d.val; commit(); },
  setAll: d => { const v = findVote(d.vote); v.electeurs.forEach(e => { v.choix[e.id] = d.val; }); commit(); },
  delConfidentialVote: d => {
    if (confirm(t("confirmDelItem"))) {
      S.votesConfidentiels = S.votesConfidentiels.filter(v => v.id !== d.vote);
      commit();
    }
  },
  delConfidentialOption: d => {
    const vote = findConfidentialVote(d.vote);
    if (!vote) return;
    vote.options = vote.options.filter(option => option.id !== d.id);
    commit();
  },
  confidentialCount: d => {
    const vote = findConfidentialVote(d.vote);
    if (!vote) return;
    const delta = Number(d.delta);
    const count = confidentialCount(vote, d.target, d.id);
    if (!Number.isInteger(count) || count + delta < 0) return;
    if (delta > 0 && confidentialTotal(vote) >= vote.limite) return;
    if (d.target === "option") vote.options.find(option => option.id === d.id).voix += delta;
    else vote[d.target] += delta;
    commit({ render: false });
    refreshConfidentialVote(vote);
  },

  delElu: d => {
    if (!confirm(t("confirmDelMember", { nom: byId(d.id).nom }))) return;
    S.elus = S.elus.filter(e => e.id !== d.id);
    delete S.presence[d.id];
    commit();
  },
  editElu: d => { editingMember = d.id; render(); },
  cancelEditElu: () => { editingMember = null; render(); },
  toggleEluStatus: d => {
    const member = byId(d.id);
    if (!member) return;
    if (member.actif && !confirm(t("confirmMemberResignation", { nom: member.nom }))) return;
    member.actif = !member.actif;
    if (member.actif) S.presence[member.id] = { present: false, mandataire: null };
    commit();
  },
  resetElus: async () => {
    if (confirm(t("confirmReset")) && await archiveCurrentSession()) {
      editingMember = null;
      S = fresh();
      commit();
    }
  },
};

const ON_CHANGE = {
  titre: (d, val) => { S.seance.titre = val; commit(); },
  date: (d, val) => {
    // Le serveur exige une date : un champ vidé est ignoré et la date en place réaffichée.
    if (!val) return render();
    S.seance.date = val;
    commit();
  },
  president: (d, val) => { S.seance.president = val; commit(); },
  mandataire: (d, val) => { pres(d.id).mandataire = val || null; commit(); },
};

const ON_SUBMIT = {
  login: f => login(f),
  saveMandate: async f => {
    const mode = f.dataset.mode;
    if (mode === "create" && !confirm(t("confirmCreateMandate"))) return;
    const startYear = Number(field(f, "startYear"));
    const endYear = Number(field(f, "endYear"));
    if (endYear <= startYear) {
      showNotification(t("mandateInvalidYears"), "error");
      return;
    }
    try {
      const result = await API.saveMandate({ startYear, endYear }, mode, mandateRevision);
      MANDATE = result.mandate;
      mandateRevision = result.revision;
      document.getElementById("mandate-dialog").close();
      showNotification(t("mandateSaved"));
      render();
    } catch (error) {
      console.error("Enregistrement du mandat impossible :", error);
      showNotification(t(isConflict(error) ? "mandateConflict" : "mandateSaveFailure"), "error");
    }
  },
  saveVoteTitle: f => {
    const objet = field(f, "objet");
    const vote = (f.dataset.type === "confidential" ? findConfidentialVote : findVote)(f.dataset.vote);
    if (!vote || !objet) return;
    vote.objet = objet;
    editingVoteTitle = null;
    commit();
  },
  addVote: f => {
    const objet = field(f, "objet");
    if (!objet) return;
    const v = {
      id: uid(),
      numero: field(f, "numero") || String(nextNumber(S.votes, S.votesConfidentiels)),
      objet,
      choix: {},
      electeurs: voters().map(e => ({ ...e, ...pres(e.id) })),
      president: S.seance.president,
    };
    S.votes.push(v);
    openVote = v.id;
    commit();
  },
  addConfidentialVote: f => {
    const objet = field(f, "objet");
    if (!objet) return;
    S.votesConfidentiels.push({
      id: uid(),
      numero: field(f, "numero") || String(nextNumber(S.votes, S.votesConfidentiels)),
      objet,
      limite: S.elus.filter(member => member.actif).length,
      options: [],
      abstentions: 0,
      npp: 0,
    });
    commit();
  },
  addConfidentialOption: f => {
    const vote = findConfidentialVote(f.dataset.vote);
    const nom = field(f, "nom");
    if (!vote || !nom) return;
    vote.options.push({ id: uid(), nom, voix: 0 });
    commit();
  },
  addElu: f => {
    const nom = field(f, "nom");
    if (!nom) return;
    S.elus.push({ id: uid(), nom, fonction: field(f, "fonction"), actif: true });
    commit();
  },
  saveElu: f => {
    const member = byId(f.dataset.id);
    const nom = field(f, "nom");
    if (!member || !nom) return;
    member.nom = nom;
    member.fonction = field(f, "fonction");
    editingMember = null;
    commit();
  },
};

/** Exécute une action et signale son échec, qu'elle soit synchrone ou non. */
async function dispatchAction(action) {
  try {
    await action();
  } catch (error) {
    console.error("Action impossible :", error);
    if (isConflict(error)) saveError = error;
    showNotification(failureMessage(error), "error");
  }
}

/** Après un échec d'enregistrement, seules les actions sans écriture restent possibles. */
function blockedBySaveError() {
  if (saveError) showNotification(failureMessage(saveError), "error");
  return Boolean(saveError);
}

const ACTIONS_WITHOUT_WRITE = ["tab", "lang", "logout"];

document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  ev.preventDefault();
  if (!ACTIONS_WITHOUT_WRITE.includes(el.dataset.act) && blockedBySaveError()) return;
  dispatchAction(() => ON_CLICK[el.dataset.act]?.(el.dataset));
});
document.addEventListener("change", ev => {
  const el = ev.target.closest("[data-change]");
  if (!el) return;
  if (blockedBySaveError()) {
    render();
    return;
  }
  dispatchAction(() => ON_CHANGE[el.dataset.change]?.(el.dataset, el.value));
});
document.addEventListener("submit", ev => {
  ev.preventDefault();
  // Se reconnecter recharge les données du serveur : c'est la sortie normale après un échec.
  if (ev.target.dataset.submit !== "login" && blockedBySaveError()) return;
  dispatchAction(() => ON_SUBMIT[ev.target.dataset.submit]?.(ev.target));
});

/* ---------- actions déclenchées par l'interface ----------
   d = dataset de l'élément (data-id, data-val, data-vote…) */

function showNotification(message, kind = "success") {
  const box = document.getElementById("notification");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("error", kind === "error");
  box.classList.add("show");
  clearTimeout(showNotification.timer);
  showNotification.timer = setTimeout(() => box.classList.remove("show"), kind === "error" ? 12000 : 3000);
}

const ON_CLICK = {
  tab: d => { current = d.val; render(); },
  lang: d => setLang(d.val),
  logout: () => logout(),
  exportCSV: () => exportCSV(),
  exportJSON: () => exportJSON(),
  archiveSession: async () => {
    if (await archiveCurrentSession()) {
      showNotification(t("archiveSuccess"));
      render();
    }
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
  setAll: d => { const v = findVote(d.vote); voteVoters(v).forEach(e => { v.choix[e.id] = d.val; }); commit(); },

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
  date: (d, val) => { S.seance.date = val; commit(); },
  president: (d, val) => { S.seance.president = val; commit(); },
  mandataire: (d, val) => { pres(d.id).mandataire = val || null; commit(); },
};

const ON_SUBMIT = {
  login: f => login(f),
  addVote: f => {
    const objet = f.elements.objet.value.trim();
    if (!objet) return;
    const v = {
      id: uid(),
      numero: f.elements.numero.value.trim(),
      objet,
      choix: {},
      electeurs: voters().map(e => ({ ...e, ...pres(e.id) })),
      president: S.seance.president,
    };
    S.votes.push(v);
    openVote = v.id;
    commit();
  },
  addElu: f => {
    const nom = f.elements.nom.value.trim();
    if (!nom) return;
    S.elus.push({ id: uid(), nom, fonction: f.elements.fonction.value.trim(), actif: true });
    commit();
  },
  saveElu: f => {
    const member = byId(f.dataset.id);
    const nom = f.elements.nom.value.trim();
    if (!member || !nom) return;
    member.nom = nom;
    member.fonction = f.elements.fonction.value.trim();
    editingMember = null;
    commit();
  },
};

const findVote = id => S.votes.find(v => v.id === id);

// Un seul écouteur par type d'événement pour toute la page
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  if (saveError && !["tab", "lang", "logout"].includes(el.dataset.act)) {
    showNotification(t("stateConflict"), "error");
    return;
  }
  try {
    Promise.resolve(ON_CLICK[el.dataset.act]?.(el.dataset)).catch(handleActionError);
  } catch (error) {
    handleActionError(error);
  }
});
document.addEventListener("change", ev => {
  const el = ev.target.closest("[data-change]");
  if (!el) return;
  if (saveError) {
    showNotification(t("stateConflict"), "error");
    render();
    return;
  }
  try {
    Promise.resolve(ON_CHANGE[el.dataset.change]?.(el.dataset, el.value, el)).catch(handleActionError);
  } catch (error) {
    handleActionError(error);
  }
});
document.addEventListener("submit", ev => {
  ev.preventDefault();
  if (saveError) {
    showNotification(t("stateConflict"), "error");
    return;
  }
  try {
    Promise.resolve(ON_SUBMIT[ev.target.dataset.submit]?.(ev.target)).catch(handleActionError);
  } catch (error) {
    handleActionError(error);
  }
});

function handleActionError(error) {
  console.error("Action impossible :", error);
  if (error instanceof ApiError && error.status === 409) saveError = error;
  showNotification(
    error instanceof ApiError && error.status === 409 ? t("stateConflict") : t("saveFailure"),
    "error",
  );
}

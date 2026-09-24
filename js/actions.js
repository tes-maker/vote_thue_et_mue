/* ---------- actions déclenchées par l'interface ----------
   d = dataset de l'élément (data-id, data-val, data-vote…) */

const ON_CLICK = {
  tab: d => { current = d.val; render(); },
  lang: d => setLang(d.val),
  logout: () => logout(),
  exportCSV: () => exportCSV(),
  saveJSON: () => saveJSON(),
  openFile: () => document.getElementById("file").click(),

  present: d => { pres(d.id).present = d.val === "1"; commit(); },
  allPresent: d => { S.elus.forEach(e => { S.presence[e.id] = { present: d.val === "1", mandataire: null }; }); commit(); },
  newSeance: () => { if (confirm(t("confirmNewSession"))) { S = fresh(S.elus); commit(); } },

  toggleVote: d => { openVote = openVote === d.vote ? null : d.vote; render(); },
  delVote: d => { if (confirm(t("confirmDelItem"))) { S.votes = S.votes.filter(v => v.id !== d.vote); commit(); } },
  choice: d => { findVote(d.vote).choix[d.id] = d.val; commit(); },
  setAll: d => { const v = findVote(d.vote); voters().forEach(e => { v.choix[e.id] = d.val; }); commit(); },

  delElu: d => {
    if (!confirm(t("confirmDelMember", { nom: byId(d.id).nom }))) return;
    S.elus = S.elus.filter(e => e.id !== d.id);
    delete S.presence[d.id];
    S.votes.forEach(v => delete v.choix[d.id]);
    commit();
  },
  resetElus: () => { if (confirm(t("confirmReset"))) { S = fresh(); commit(); } },
};

const ON_CHANGE = {
  titre: (d, val) => { S.seance.titre = val; commit(); },
  date: (d, val) => { S.seance.date = val; commit(); },
  president: (d, val) => { S.seance.president = val; commit(); },
  mandataire: (d, val) => { pres(d.id).mandataire = val || null; commit(); },
  elu: (d, val) => { byId(d.id)[d.field] = val.trim(); commit(); },
  file: (d, val, el) => loadJSON(el),
};

const ON_SUBMIT = {
  login: f => login(f),
  addVote: f => {
    const objet = f.elements.objet.value.trim();
    if (!objet) return;
    const v = { id: uid(), numero: f.elements.numero.value.trim(), objet, choix: {} };
    S.votes.push(v);
    openVote = v.id;
    commit();
  },
  addElu: f => {
    const nom = f.elements.nom.value.trim();
    if (!nom) return;
    S.elus.push({ id: uid(), nom, fonction: f.elements.fonction.value.trim() });
    commit();
  },
};

const findVote = id => S.votes.find(v => v.id === id);

// Un seul écouteur par type d'événement pour toute la page
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (el) ON_CLICK[el.dataset.act]?.(el.dataset);
});
document.addEventListener("change", ev => {
  const el = ev.target.closest("[data-change]");
  if (el) ON_CHANGE[el.dataset.change]?.(el.dataset, el.value, el);
});
document.addEventListener("submit", ev => {
  ev.preventDefault();
  ON_SUBMIT[ev.target.dataset.submit]?.(ev.target);
});

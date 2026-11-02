const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("shows archived vote titles read-only until the session is resumed", () => {
  const history = { innerHTML: "" };
  const context = {
    window: { location: { pathname: "/history" }, addEventListener: () => {} },
    document: { getElementById: () => history },
    ARCHIVES: [{
      id: "session1",
      archivedAt: "2026-11-01T12:00:00.000Z",
      snapshot: {
        seance: { id: "session1", titre: "Conseil", date: "2026-11-01" },
        votes: [{
          id: "vote1",
          numero: "1",
          objet: "Titre à corriger",
          electeurs: [{ id: "member1", nom: "Élu" }],
          choix: { member1: "pour" },
        }],
        votesConfidentiels: [{
          id: "secret1",
          numero: "2",
          objet: "Vote secret",
          options: [{ id: "option1", nom: "Option A", voix: 1 }],
          limite: 1,
          abstentions: 0,
          npp: 0,
        }],
      },
    }],
    lang: "fr",
    esc: value => String(value),
    attrs: values => Object.entries(values).map(([key, value]) => `data-${key}="${value}"`).join(" "),
    t: (key, params = {}) => ({
      historyTitle: `Historique (${params.n})`,
      defaultSession: "Séance",
      historyArchivedAt: `Archivée ${params.date}`,
      statVoters: "Votants",
      choice_pour: "Pour",
      choice_contre: "Contre",
      tallyAbst: "Abstentions",
      confidentialTotal: "Bulletins",
      confidentialAbstentions: "Abstention",
      confidentialNpp: "NPP",
      noOptions: "Aucune option",
      historyRestore: "Restaurer",
    })[key] ?? key,
    fmtDate: value => value,
    voteVoters: vote => vote.electeurs,
    voteSession: () => ({}),
    tally: () => ({ ok: true, res: "res_adopted", votants: 1, pour: 1, contre: 0, abst: 0, npp: 0 }),
    choice: () => "pour",
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );
  context.renderHistory();

  assert.match(history.innerHTML, /Titre à corriger/);
  assert.match(history.innerHTML, /Vote secret/);
  assert.match(history.innerHTML, /data-act="restoreArchive"/);
  assert.doesNotMatch(history.innerHTML, /editVoteTitle|Modifier le titre/);
});

test("offers title editing for active nominal and confidential votes", () => {
  const context = vm.createContext({
    editingVoteTitle: null,
    esc: value => String(value),
    attrs: values => Object.entries(values).map(([key, value]) => `data-${key}="${value}"`).join(" "),
    t: key => ({
      historyVoteTitle: "Titre du vote",
      saveTitle: "Enregistrer",
      cancel: "Annuler",
      editTitle: "Modifier le titre",
    })[key] ?? key,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js/render.js"), "utf8"),
    context,
  );

  const nominal = vm.runInContext('renderVoteTitle({ id: "vote1", numero: "1", objet: "Vote nominal" }, "nominal")', context);
  const confidential = vm.runInContext('renderVoteTitle({ id: "vote2", numero: "2", objet: "Vote secret" }, "confidential")', context);
  assert.match(nominal, /data-act="editVoteTitle" data-vote="vote1" data-type="nominal"/);
  assert.match(confidential, /data-act="editVoteTitle" data-vote="vote2" data-type="confidential"/);
  vm.runInContext('editingVoteTitle = { voteId: "vote2", type: "confidential" }', context);
  const form = vm.runInContext('renderVoteTitle({ id: "vote2", numero: "2", objet: "Vote secret" }, "confidential")', context);
  assert.match(form, /data-submit="saveVoteTitle"/);
  assert.match(form, /value="Vote secret"/);
});

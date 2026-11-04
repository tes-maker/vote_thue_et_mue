const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function createExportContext() {
  const members = [
    { id: "m1", nom: "Présent", fonction: "Maire", present: true, mandataire: null },
    { id: "m2", nom: "=Formule", fonction: "Conseiller", present: false, mandataire: "m1" },
    { id: "m3", nom: "Absent; troisième", fonction: "Conseiller", present: false, mandataire: "m1" },
  ];
  const vote = {
    id: "v1",
    numero: "1",
    objet: 'Objet "important"',
    choix: { m1: "pour", m2: "contre", m3: "abst" },
    electeurs: members,
    president: "m1",
  };
  const S = {
    elus: members,
    seance: { id: "s1", titre: "Conseil municipal", date: "2026-11-01", president: "m1" },
    presence: {},
    votes: [vote],
    votesConfidentiels: [],
  };
  const downloads = [];
  const context = {
    S,
    ARCHIVES: [],
    saveQueue: Promise.resolve(true),
    saveError: null,
    t: key => ({
      csvFile: "votes_conseil",
      jsonFile: "seance",
      confidentialAbstentions: "Abstention",
      confidentialNpp: "NPP",
      confidentialLabel: "Confidentiel",
    })[key] ?? key,
    today: () => "2026-11-01",
    byId: id => members.find(member => member.id === id),
    choice: (item, id) => item.choix[id],
    tally: () => ({ pour: 1, contre: 1, abst: 1, npp: 0, res: "res_rejectedTie" }),
    showNotification: () => {},
    download: (...args) => downloads.push(args),
    API: {},
    revision: 1,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/export.js"), "utf8"),
    context,
  );
  return { context, downloads, S };
}

test("exports CSV as a flat, quoted row per voter and prevents spreadsheet formulas", async () => {
  const { context, downloads } = createExportContext();
  await context.exportCSV();

  const [filename, content, mime] = downloads[0];
  const rows = content.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(filename, "votes_conseil_2026-11-01.csv");
  assert.equal(mime, "text/csv;charset=utf-8");
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^"session_id";"session_title";"session_date"/);
  assert.match(rows[1], /"m1";"Présent";"Maire";"present"/);
  assert.match(rows[2], /"m2";"'=Formule";"Conseiller";"represented";"Présent";"contre";"nominal";"";"";""$/);
  assert.match(rows[3], /"m3";"Absent; troisième";"Conseiller";"represented";"Présent";"abst";"nominal";"";"";""$/);
});

test("exports confidential ballots only as anonymized aggregate counts", async () => {
  const { context, downloads } = createExportContext();
  context.S.votesConfidentiels.push({
    id: "secret1",
    numero: "2",
    objet: "Désignation",
    limite: 3,
    options: [{ id: "option1", nom: "Option A", voix: 1 }],
    abstentions: 1,
    npp: 0,
  });
  await context.exportCSV();

  const rows = downloads[0][1].replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(rows.length, 7);
  assert.match(rows[4], /"confidential";"Option A";"1";"3"$/);
  assert.match(rows[5], /"confidential";"Abstention";"1";"3"$/);
  assert.match(rows[6], /"confidential";"NPP";"0";"3"$/);
  assert.doesNotMatch(rows.slice(4).join("\n"), /"m1"|"m2"|"Présent"|"Formule"/);
});

test("exports the active session as plain JSON, not a local backup bundle", async () => {
  const { context, downloads, S } = createExportContext();
  await context.exportJSON();

  const [filename, content, mime] = downloads[0];
  assert.equal(filename, "seance_2026-11-01.json");
  assert.equal(mime, "application/json;charset=utf-8");
  assert.equal(content, JSON.stringify(S, null, 2));
});

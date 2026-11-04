/* ---------- exports CSV et JSON de la séance en cours ---------- */
const CSV_HEADERS = [
  "session_id", "session_title", "session_date", "session_president",
  "resolution_id", "resolution_number", "resolution_subject", "result",
  "for_count", "against_count", "abstention_count", "not_voting_count",
  "member_id", "member_name", "member_role", "attendance", "proxy_holder", "choice",
  "ballot_type", "option", "count", "eligible_limit",
];

/** Un export ne doit pas décrire autre chose que ce que le serveur a enregistré. */
async function savedOrNotify() {
  if (await saveQueue && !saveError) return true;
  showNotification(t("saveFailure"), "error");
  return false;
}

/** Échappe une cellule ; l'apostrophe empêche un tableur d'exécuter une formule. */
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const csvLine = values => values.map(csvCell).join(";");

/** Une ligne par électeur. `result` contient la clé stable du résultat (res_*), non traduite. */
function nominalCsvLines(v) {
  const result = tally(v);
  const president = byId(S.seance.president)?.nom ?? "";
  const names = new Map(v.electeurs.map(member => [member.id, member.nom]));
  return v.electeurs.map(member => csvLine([
    S.seance.id, S.seance.titre, S.seance.date, president,
    v.id, v.numero, v.objet, result.res,
    result.pour, result.contre, result.abst, result.npp,
    member.id, member.nom, member.fonction,
    member.present ? "present" : member.mandataire ? "represented" : "absent",
    member.mandataire ? names.get(member.mandataire) ?? "" : "",
    choice(v, member.id),
    "nominal", "", "", "",
  ]));
}

/** Une ligne par compteur, sans aucune colonne relative aux élus. */
function confidentialCsvLines(v) {
  return [
    ...v.options.map(option => [option.nom, option.voix]),
    [t("confidentialAbstentions"), v.abstentions],
    [t("confidentialNpp"), v.npp],
  ].map(([option, count]) => csvLine([
    S.seance.id, S.seance.titre, S.seance.date, "",
    v.id, v.numero, v.objet, t("confidentialLabel"),
    "", "", "", "",
    "", "", "", "", "", "",
    "confidential", option, count, v.limite,
  ]));
}

/** Le BOM UTF-8 permet à Excel de reconnaître l'encodage à l'ouverture. */
async function exportCSV() {
  if (!await savedOrNotify()) return;
  const lines = [
    csvLine(CSV_HEADERS),
    ...S.votes.flatMap(nominalCsvLines),
    ...S.votesConfidentiels.flatMap(confidentialCsvLines),
  ];
  download(`${t("csvFile")}_${S.seance.date || today()}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

async function exportJSON() {
  if (!await savedOrNotify()) return;
  download(`${t("jsonFile")}_${S.seance.date || today()}.json`, JSON.stringify(S, null, 2), "application/json;charset=utf-8");
}

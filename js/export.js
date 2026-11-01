/* ---------- export CSV (dans la langue affichée) ---------- */
async function exportCSV() {
  if (!await saveQueue || saveError) {
    showNotification(t("saveFailure"), "error");
    return;
  }
  const cell = value => {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const line = arr => arr.map(cell).join(";");
  const pr = byId(S.seance.president);
  const headers = [
    "session_id", "session_title", "session_date", "session_president",
    "resolution_id", "resolution_number", "resolution_subject", "result",
    "for_count", "against_count", "abstention_count", "not_voting_count",
    "member_id", "member_name", "member_role", "attendance", "proxy_holder", "choice",
  ];
  const out = [
    line(headers),
    ...S.votes.flatMap(v => {
      const voters = voteVoters(v);
      const result = tally(v, voters, voteSession(v));
      const holderNames = new Map(voters.map(member => [member.id, member.nom]));
      return voters.map(member => line([
        S.seance.id, S.seance.titre, S.seance.date, pr?.nom ?? "",
        v.id, v.numero, v.objet, result.res,
        result.pour, result.contre, result.abst, result.npp,
        member.id, member.nom, member.fonction,
        member.present ? "present" : member.mandataire ? "represented" : "absent",
        member.mandataire ? holderNames.get(member.mandataire) ?? "" : "",
        choice(v, member.id),
      ]));
    }),
  ];
  download(`${t("csvFile")}_${S.seance.date || today()}.csv`, "\uFEFF" + out.join("\r\n"), "text/csv;charset=utf-8");
}

async function exportJSON() {
  if (!await saveQueue || saveError) {
    showNotification(t("saveFailure"), "error");
    return;
  }
  download(
    `${t("jsonFile")}_${S.seance.date || today()}.json`,
    JSON.stringify(S, null, 2),
    "application/json;charset=utf-8",
  );
}

let archiveInProgress = false;

async function archiveCurrentSession() {
  if (archiveInProgress) return false;
  archiveInProgress = true;
  try {
    if (!await saveQueue || saveError) return false;
    const result = await API.archive(revision);
    revision = result.revision;
    ARCHIVES = [...ARCHIVES.filter(item => item.id !== result.archive.id), result.archive];
    setSaveStatus("serverSaved");
    return true;
  } finally {
    archiveInProgress = false;
  }
}

function restoreArchive(id) {
  const entry = ARCHIVES.find(item => item.id === id);
  if (!entry || !confirm(t("historyRestoreConfirm"))) return;
  S = normalize(entry.snapshot);
  openVote = null;
  current = "votes";
  return commit();
}

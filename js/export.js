/* ---------- export CSV (dans la langue affichée) ---------- */
function exportCSV() {
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = arr => arr.map(cell).join(";");
  const pr = byId(S.seance.president);
  const c = counts();
  const vs = voters();
  const out = [
    line([t("session"), S.seance.titre]),
    line([t("date"), fmtDate(S.seance.date)]),
    line([t("president"), pr ? pr.nom : ""]),
    line([t("csvMembers"), c.n]),
    line([t("statPresent"), c.p]),
    line([t("statRepresented"), c.r]),
    line([t("statAbsent"), c.a]),
    line(["Quorum", t(c.quorumOk ? "quorumOk" : "quorumKo")]),
    "",
    line([t("csvResults")]),
    line([t("csvNo"), t("csvSubject"), t("statVoters"), t("choice_pour"), t("choice_contre"), t("tallyAbst"), t("tallyNpp"), t("csvResult")]),
    ...S.votes.map(v => { const r = tally(v, vs); return line([v.numero, v.objet, r.votants, r.pour, r.contre, r.abst, r.npp, t(r.res)]); }),
    "",
    line([t("csvDetail")]),
    line([t("colName"), t("colRole"), t("colAttendance"), t("csvProxyTo"), ...S.votes.map(v => t("csvItem", { n: v.numero }))]),
    ...S.elus.map(e => {
      const m = pres(e.id).mandataire;
      return line([e.nom, e.fonction, statut(e), m && !isPresent(e.id) ? byId(m).nom : "",
        ...S.votes.map(v => isVoter(e) ? t("choice_" + choice(v, e.id)) : "")]);
    }),
  ];
  // BOM pour qu'Excel lise correctement les accents
  download(`${t("csvFile")}_${S.seance.date || today()}.csv`, "﻿" + out.join("\r\n"), "text/csv;charset=utf-8");
}

/* ---------- sauvegarde / ouverture d'une séance ---------- */
function saveJSON() {
  download(`${t("jsonFile")}_${S.seance.date || today()}.json`, JSON.stringify(S, null, 2), "application/json");
}
function loadJSON(input) {
  const f = input.files[0];
  if (!f) return;
  f.text().then(txt => {
    let s = null;
    try { s = normalize(JSON.parse(txt)); } catch (e) {}
    if (s) { S = s; openVote = null; commit(); } else alert(t("invalidFile"));
    input.value = "";
  });
}

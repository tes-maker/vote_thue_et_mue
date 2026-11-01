/* ---------- affichage des onglets ----------
   Les boutons portent data-act (clic), les champs data-change (modification),
   les formulaires data-submit : voir actions.js. */
const TAB_IDS = ["presence", "votes", "confidential", "elus", "history"];
const initialPathTab = typeof window !== "undefined"
  ? window.location.pathname.split("/").filter(Boolean).at(-1)
  : null;
let current = TAB_IDS.includes(initialPathTab) ? initialPathTab : "presence";
let openVote = null;
let editingMember = null;
let editingVoteTitle = null;

function navigateToTab(tab) {
  if (!TAB_IDS.includes(tab)) return;
  current = tab;
  const path = `/${tab}`;
  if (window.location.pathname !== path) window.history.pushState(null, "", path);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);
    current = TAB_IDS.includes(pathTab) ? pathTab : "presence";
    render();
  });
}

// Attributs data-* échappés : attrs({ act: "x", id: 1 }) -> data-act="x" data-id="1"
const attrs = o => Object.entries(o).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

function render() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.val === current));
  for (const id of ["presence", "votes", "confidential", "elus", "history"]) document.getElementById(id).classList.toggle("hidden", id !== current);
  document.getElementById("subtitle").textContent = t("subtitle", { titre: S.seance.titre || t("defaultSession"), date: fmtDate(S.seance.date) });
  ({ presence: renderPresence, votes: renderVotes, confidential: renderConfidentialVotes, elus: renderElus, history: renderHistory })[current]();
}

function renderStats() {
  const c = counts();
  const stat = (value, label, cls = "") => `<div class="stat"><b class="${cls}">${value}</b><span>${label}</span></div>`;
  return `<div class="stats">
    ${stat(c.n, t("statMembers"))}
    ${stat(c.p, t("statPresent"))}
    ${stat(c.r, t("statRepresented"))}
    ${stat(c.a, t("statAbsent"))}
    ${stat(c.p + c.r, t("statVoters"))}
    ${stat(t(c.quorumOk ? "quorumOk" : "quorumKo"), t("quorum", { n: c.quorum }), c.quorumOk ? "ok" : "ko")}
  </div>`;
}

/* ---------- onglet Séance & présences ---------- */
function renderPresence() {
  const activeMembers = S.elus.filter(e => e.actif);
  const presents = activeMembers.filter(e => isPresent(e.id));
  const held = proxies();
  const rows = activeMembers.map(e => {
    const p = pres(e.id);
    const represented = held.get(e.id) ?? [];
    const proc = p.present
      ? (represented.length ? `<span class="note">${t("proxyHolder")} <b>${represented.map(m => esc(m.nom)).join(", ")}</b></span>` : "")
      : `<select ${attrs({ change: "mandataire", id: e.id })}>${option("", t("noProxy"))}${
          presents.filter(h => h.id !== e.id || p.mandataire === h.id).map(h => option(h.id, h.nom, p.mandataire === h.id)).join("")
        }</select>`;
    return `<tr>
      <td><div>${esc(e.nom)}</div><div class="f">${esc(e.fonction)}</div></td>
      <td><div class="seg">
        <button class="${p.present ? "on" : ""}" ${attrs({ act: "present", id: e.id, val: 1 })}>${t("present")}</button>
        <button class="${p.present ? "" : "on"}" ${attrs({ act: "present", id: e.id, val: 0 })}>${t("absent")}</button>
      </div></td>
      <td>${proc}</td>
    </tr>`;
  }).join("");

  document.getElementById("presence").innerHTML = `
    <div class="row spread">
      <h2>${t("session")}</h2>
      <div class="row">
        <button class="b" data-act="manageMandate">${t("currentMandate", {
          start: MANDATE.startYear,
          end: MANDATE.endYear,
        })}</button>
        <button class="b primary" data-act="archiveSession">${t("archiveSession")}</button>
        <button class="b" data-act="newSeance">${t("newSession")}</button>
      </div>
    </div>
    <div class="grid">
      <label>${t("sessionTitle")}<input value="${esc(S.seance.titre)}" data-change="titre"></label>
      <label>${t("date")}<input type="date" value="${esc(S.seance.date)}" data-change="date"></label>
      <label>${t("president")}<select data-change="president">${activeMembers.map(e => option(e.id, e.nom, S.seance.president === e.id)).join("")}</select></label>
    </div>
    ${renderStats()}
    <div class="row spread section">
      <h2>${t("attendance")}</h2>
      <div class="row">
        <button class="b" ${attrs({ act: "allPresent", val: 1 })}>${t("allPresent")}</button>
        <button class="b" ${attrs({ act: "allPresent", val: 0 })}>${t("allAbsent")}</button>
      </div>
    </div>
    <p class="note">${t("proxyRule")}</p>
    <div class="scroll"><table>
      <thead><tr><th>${t("colMember")}</th><th>${t("colAttendance")}</th><th>${t("colProxy")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    `;
}

function renderActiveVoteTitle(vote, type) {
  const isEditing = editingVoteTitle?.voteId === vote.id && editingVoteTitle.type === type;
  if (isEditing) {
    return `<form class="row archive-vote-title" data-submit="saveVoteTitle" ${attrs({
      vote: vote.id,
      type,
    })}>
      <input name="objet" class="grow" maxlength="5000" value="${esc(vote.objet)}" aria-label="${t("historyVoteTitle")}" required>
      <button class="b primary" type="submit">${t("saveTitle")}</button>
      <button class="b" type="button" data-act="cancelVoteTitle">${t("cancel")}</button>
    </form>`;
  }
  return `<div class="row spread archive-vote-title">
    <h3>${esc(vote.numero)}. ${esc(vote.objet)}</h3>
    <button class="link" ${attrs({ act: "editVoteTitle", vote: vote.id, type })}>${t("editTitle")}</button>
  </div>`;
}

function renderArchivedVoteTitle(vote) {
  return `<div class="row spread archive-vote-title">
    <h3>${esc(vote.numero)}. ${esc(vote.objet)}</h3>
  </div>`;
}

function renderHistory() {
  const entries = [...ARCHIVES].sort((a, b) => b.snapshot.seance.date.localeCompare(a.snapshot.seance.date)
    || b.archivedAt.localeCompare(a.archivedAt));
  const cards = entries.map(({ id, archivedAt, snapshot }) => {
    const votes = snapshot.votes.map(v => {
      const vs = voteVoters(v);
      const r = tally(v, vs, voteSession(v));
      const details = vs.map(e => `<li>${esc(e.nom)} — ${t("choice_" + choice(v, e.id))}</li>`).join("");
      return `<article class="card">
        ${renderArchivedVoteTitle(v)}
        <div class="row spread">
          <span class="badge ${r.ok === true ? "ok" : r.ok === false ? "ko" : ""}">${t(r.res)}</span>
        </div>
        <div class="tally">${t("statVoters")} <b>${r.votants}</b> · ${t("choice_pour")} <b>${r.pour}</b> · ${t("choice_contre")} <b>${r.contre}</b> · ${t("tallyAbst")} <b>${r.abst}</b>${r.npp ? ` · ${t("tallyNpp")} <b>${r.npp}</b>` : ""}</div>
        <details><summary>${t("voteDetails")}</summary><ul>${details}</ul></details>
      </article>`;
    }).join("");
    const confidentialVotes = snapshot.votesConfidentiels.map(v => {
      const totals = confidentialTotals(v);
      const options = v.options.map(option => `<li>${esc(option.nom)} — ${option.voix}</li>`).join("");
      return `<article class="card">
        ${renderArchivedVoteTitle(v)}
        <div class="row spread"><span class="badge">${t("confidentialLabel")}</span></div>
        <div class="tally">${t("confidentialTotal")} <b>${totals.total}</b> / ${v.limite} · ${t("confidentialAbstentions")} <b>${v.abstentions}</b> · ${t("confidentialNpp")} <b>${v.npp}</b></div>
        <ul>${options || `<li>${t("noOptions")}</li>`}</ul>
      </article>`;
    }).join("");
    return `<section class="section">
      <div class="row spread">
        <div><h2>${esc(snapshot.seance.titre || t("defaultSession"))} — ${esc(fmtDate(snapshot.seance.date))}</h2>
        <p class="note">${t("historyArchivedAt", { date: new Date(archivedAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB") })}</p></div>
        <button class="b" ${attrs({ act: "restoreArchive", id })}>${t("historyRestore")}</button>
      </div>
      ${votes}
      ${confidentialVotes}
      ${votes || confidentialVotes ? "" : `<p class="note">${t("historyNoVotes")}</p>`}
    </section>`;
  }).join("");

  document.getElementById("history").innerHTML = `
    <h2>${t("historyTitle", { n: entries.length })}</h2>
    ${cards || `<p class="note">${t("historyEmpty")}</p>`}`;
}

/* ---------- onglet Votes ---------- */
function renderVoteDetail(v, vs) {
  const rows = vs.map(e => {
    const c = choice(v, e.id);
    const p = e;
    const holder = vs.find(member => member.id === p.mandataire);
    const via = p.present ? "" : `<div class="f">${t("viaProxy", { nom: esc(holder?.nom || "") })}</div>`;
    const btns = CHOIX.map(k => `<button class="${k}${c === k ? " on" : ""}" title="${t("choice_" + k)}" ${attrs({ act: "choice", vote: v.id, id: e.id, val: k })}>${
      t(k === "npp" ? "short_npp" : "choice_" + k)}</button>`).join("");
    return `<tr><td>${esc(e.nom)}${via}</td><td class="right"><div class="seg">${btns}</div></td></tr>`;
  }).join("");
  const all = (val, key) => `<button class="b" ${attrs({ act: "setAll", vote: v.id, val })}>${t(key)}</button>`;
  return `
    <div class="row detail">${all("pour", "allFor")}${all("contre", "allAgainst")}${all("abst", "allAbst")}</div>
    <div class="scroll"><table><tbody>${rows}</tbody></table></div>`;
}

function renderVotes() {
  const next = Math.max(0, ...S.votes.map(v => parseInt(v.numero) || 0)) + 1;
  const cards = S.votes.map(v => {
    const vs = voteVoters(v);
    const r = tally(v, vs, voteSession(v));
    const open = openVote === v.id;
    return `<div class="card">
      <div class="row spread">
      ${renderActiveVoteTitle(v, "nominal")}
        <div class="row">
          <span class="badge ${r.ok === true ? "ok" : r.ok === false ? "ko" : ""}">${t(r.res)}</span>
          <button class="b" ${attrs({ act: "toggleVote", vote: v.id })}>${t(open ? "close" : "enterVotes")}</button>
          <button class="link" ${attrs({ act: "delVote", vote: v.id })}>${t("delete")}</button>
        </div>
      </div>
      <div class="tally">${t("statVoters")} <b>${r.votants}</b> · ${t("choice_pour")} <b>${r.pour}</b> · ${t("choice_contre")} <b>${r.contre}</b> · ${t("tallyAbst")} <b>${r.abst}</b>${r.npp ? ` · ${t("tallyNpp")} <b>${r.npp}</b>` : ""}</div>
      ${open ? renderVoteDetail(v, vs) : ""}
    </div>`;
  }).join("");

  document.getElementById("votes").innerHTML = `
    ${renderStats()}
    <h2>${t("newItem")}</h2>
    <form class="row" data-submit="addVote">
      <input name="numero" value="${next}" class="num" aria-label="${t("number")}">
      <input name="objet" placeholder="${t("itemPlaceholder")}" class="grow" required>
      <button class="b primary lg">${t("add")}</button>
    </form>
    <p class="note">${t("defaultFor")}</p>
    <h2>${t("items", { n: S.votes.length })}</h2>
    ${cards || `<p class="note">${t("noItems")}</p>`}`;
}

function confidentialTotals(v) {
  const options = v.options.reduce((sum, option) => sum + option.voix, 0);
  return { options, total: options + v.abstentions + v.npp };
}

function refreshConfidentialVote(vote) {
  const card = [...document.querySelectorAll("[data-confidential-vote]")]
    .find(element => element.dataset.confidentialVote === vote.id);
  if (!card) return;

  const totals = confidentialTotals(vote);
  card.querySelector("[data-confidential-limit]").textContent = t("confidentialLimit", {
    total: totals.total,
    limite: vote.limite,
  });
  for (const element of card.querySelectorAll("[data-confidential-count]")) {
    const count = element.dataset.confidentialTarget === "abstentions" || element.dataset.confidentialTarget === "npp"
      ? vote[element.dataset.confidentialTarget]
      : vote.options.find(option => option.id === element.dataset.confidentialId)?.voix;
    if (Number.isInteger(count)) element.textContent = String(count);
  }
  for (const button of card.querySelectorAll('[data-act="confidentialCount"]')) {
    const count = button.dataset.target === "abstentions" || button.dataset.target === "npp"
      ? vote[button.dataset.target]
      : vote.options.find(option => option.id === button.dataset.id)?.voix;
    button.disabled = button.dataset.delta === "1"
      ? totals.total >= vote.limite
      : !Number.isInteger(count) || count === 0;
  }
}

function renderConfidentialVotes() {
  const next = Math.max(
    0,
    ...S.votes.map(v => parseInt(v.numero, 10) || 0),
    ...S.votesConfidentiels.map(v => parseInt(v.numero, 10) || 0),
  ) + 1;
  const cards = S.votesConfidentiels.map(v => {
    const totals = confidentialTotals(v);
    const rows = [
      ...v.options.map(option => ({
        id: option.id,
        label: option.nom,
        count: option.voix,
        target: "option",
      })),
      { id: "", label: t("confidentialAbstentions"), count: v.abstentions, target: "abstentions" },
      { id: "", label: t("confidentialNpp"), count: v.npp, target: "npp" },
    ].map(row => `<tr>
      <td>${esc(row.label)}</td>
      <td class="confidential-count" ${attrs({
        "confidential-count": "",
        "confidential-target": row.target,
        "confidential-id": row.id,
      })}>${row.count}</td>
      <td class="member-actions">
        <button type="button" class="member-action" ${attrs({ act: "confidentialCount", vote: v.id, id: row.id, target: row.target, delta: -1 })} ${row.count === 0 ? "disabled" : ""} aria-label="${esc(t("confidentialDecrement", { nom: row.label }))}">-</button>
        <button type="button" class="member-action" ${attrs({ act: "confidentialCount", vote: v.id, id: row.id, target: row.target, delta: 1 })} ${totals.total >= v.limite ? "disabled" : ""} aria-label="${esc(t("confidentialIncrement", { nom: row.label }))}">+</button>
        ${row.target === "option" ? `<button type="button" class="link" ${attrs({ act: "delConfidentialOption", vote: v.id, id: row.id })}>${t("delete")}</button>` : ""}
      </td>
    </tr>`).join("");
    return `<article class="card" ${attrs({ "confidential-vote": v.id })}>
      <div class="row spread">
        ${renderActiveVoteTitle(v, "confidential")}
        <button class="link" ${attrs({ act: "delConfidentialVote", vote: v.id })}>${t("delete")}</button>
      </div>
      <p class="note" data-confidential-limit>${t("confidentialLimit", { total: totals.total, limite: v.limite })}</p>
      <form class="row" data-submit="addConfidentialOption" ${attrs({ vote: v.id })}>
        <input name="nom" class="grow" maxlength="255" placeholder="${t("optionPlaceholder")}" required>
        <button class="b" type="submit">${t("addOption")}</button>
      </form>
      <div class="scroll section"><table>
        <thead><tr><th>${t("optionName")}</th><th>${t("confidentialCount")}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </article>`;
  }).join("");

  document.getElementById("confidential").innerHTML = `
    <h2>${t("newConfidentialVote")}</h2>
    <form class="row" data-submit="addConfidentialVote">
      <input name="numero" value="${next}" class="num" aria-label="${t("number")}">
      <input name="objet" placeholder="${t("confidentialVotePlaceholder")}" class="grow" maxlength="5000" required>
      <button class="b primary lg">${t("add")}</button>
    </form>
    <p class="note">${t("confidentialInstructions")}</p>
    <h2>${t("confidentialVotesTitle", { n: S.votesConfidentiels.length })}</h2>
    ${cards || `<p class="note">${t("noConfidentialVotes")}</p>`}`;
}

/* ---------- onglet Liste des élus ---------- */
function renderElus() {
  const rows = S.elus.map(e => {
    if (editingMember === e.id) {
      return `<tr><td colspan="4">
        <form class="row member-edit" data-submit="saveElu" ${attrs({ id: e.id })}>
          <label>${t("colName")}<input name="nom" value="${esc(e.nom)}" required></label>
          <label class="grow">${t("colRole")}<input name="fonction" value="${esc(e.fonction)}"></label>
          <button class="b primary" type="submit">${t("validate")}</button>
          <button class="b" type="button" ${attrs({ act: "cancelEditElu" })}>${t("cancel")}</button>
        </form>
      </td></tr>`;
    }
    const status = e.actif ? "memberActive" : "memberResigned";
    const action = e.actif ? "memberMarkResigned" : "memberReactivate";
    return `<tr>
      <td class="w30">${esc(e.nom)}</td>
      <td>${esc(e.fonction)}</td>
      <td><button class="member-action member-status ${e.actif ? "active" : "resigned"}"
        ${attrs({ act: "toggleEluStatus", id: e.id })}
        aria-pressed="${e.actif}" aria-label="${esc(t("memberStatusControl", { status: t(status), action: t(action) }))}"
        title="${t(action)}">${t(status)}</button></td>
      <td class="member-actions">
        <button class="member-action member-edit-action" ${attrs({ act: "editElu", id: e.id })}>${t("edit")}</button>
        <button class="member-action member-delete-action" ${attrs({ act: "delElu", id: e.id })}>${t("delete")}</button>
      </td>
    </tr>`;
  }).join("");
  document.getElementById("elus").innerHTML = `
    <h2>${t("addMember")}</h2>
    <form class="row" data-submit="addElu">
      <input name="nom" placeholder="${t("namePlaceholder")}" required>
      <input name="fonction" placeholder="${t("rolePlaceholder")}" class="grow">
      <button class="b primary lg">${t("add")}</button>
    </form>
    <h2>${t("members", { n: S.elus.filter(member => member.actif).length })}</h2>
    <p class="note">${t("memberStatusNote")}</p>
    <div class="scroll"><table>
      <thead><tr><th>${t("colName")}</th><th>${t("colRole")}</th><th>${t("memberStatus")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="section"><button class="b" data-act="resetElus">${t("resetList")}</button></div>`;
}

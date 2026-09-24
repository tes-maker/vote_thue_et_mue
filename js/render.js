/* ---------- affichage des onglets ----------
   Les boutons portent data-act (clic), les champs data-change (modification),
   les formulaires data-submit : voir actions.js. */
let current = "presence";
let openVote = null;

// Attributs data-* échappés : attrs({ act: "x", id: 1 }) -> data-act="x" data-id="1"
const attrs = o => Object.entries(o).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

function render() {
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.val === current));
  for (const id of ["presence", "votes", "elus"]) document.getElementById(id).classList.toggle("hidden", id !== current);
  document.getElementById("subtitle").textContent = t("subtitle", { titre: S.seance.titre || t("defaultSession"), date: fmtDate(S.seance.date) });
  ({ presence: renderPresence, votes: renderVotes, elus: renderElus })[current]();
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
  const presents = S.elus.filter(e => isPresent(e.id));
  const held = proxies();
  const rows = S.elus.map(e => {
    const p = pres(e.id);
    const m = held.get(e.id);
    const proc = p.present
      ? (m ? `<span class="note">${t("proxyHolder")} <b>${esc(m.nom)}</b></span>` : "")
      : `<select ${attrs({ change: "mandataire", id: e.id })}>${option("", t("noProxy"))}${
          presents.filter(h => !held.has(h.id) || p.mandataire === h.id).map(h => option(h.id, h.nom, p.mandataire === h.id)).join("")
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
    <h2>${t("session")}</h2>
    <div class="grid">
      <label>${t("sessionTitle")}<input value="${esc(S.seance.titre)}" data-change="titre"></label>
      <label>${t("date")}<input type="date" value="${esc(S.seance.date)}" data-change="date"></label>
      <label>${t("president")}<select data-change="president">${S.elus.map(e => option(e.id, e.nom, S.seance.president === e.id)).join("")}</select></label>
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
    <div class="section"><button class="b" data-act="newSeance">${t("newSession")}</button></div>`;
}

/* ---------- onglet Votes ---------- */
function renderVoteDetail(v, vs) {
  const rows = vs.map(e => {
    const c = choice(v, e.id);
    const p = pres(e.id);
    const via = p.present ? "" : `<div class="f">${t("viaProxy", { nom: esc(byId(p.mandataire).nom) })}</div>`;
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
  const vs = voters();
  const next = Math.max(0, ...S.votes.map(v => parseInt(v.numero) || 0)) + 1;
  const cards = S.votes.map(v => {
    const r = tally(v, vs);
    const open = openVote === v.id;
    return `<div class="card">
      <div class="row spread">
        <h3>${esc(v.numero)}. ${esc(v.objet)}</h3>
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

/* ---------- onglet Liste des élus ---------- */
function renderElus() {
  const rows = S.elus.map(e => `<tr>
    <td class="w30"><input value="${esc(e.nom)}" ${attrs({ change: "elu", id: e.id, field: "nom" })}></td>
    <td><input value="${esc(e.fonction)}" ${attrs({ change: "elu", id: e.id, field: "fonction" })}></td>
    <td class="shrink"><button class="link" ${attrs({ act: "delElu", id: e.id })}>${t("delete")}</button></td>
  </tr>`).join("");
  document.getElementById("elus").innerHTML = `
    <h2>${t("addMember")}</h2>
    <form class="row" data-submit="addElu">
      <input name="nom" placeholder="${t("namePlaceholder")}" required>
      <input name="fonction" placeholder="${t("rolePlaceholder")}" class="grow">
      <button class="b primary lg">${t("add")}</button>
    </form>
    <h2>${t("members", { n: S.elus.length })}</h2>
    <div class="scroll"><table>
      <thead><tr><th>${t("colName")}</th><th>${t("colRole")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="section"><button class="b" data-act="resetElus">${t("resetList")}</button></div>`;
}

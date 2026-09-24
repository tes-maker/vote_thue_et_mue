/* ---------- traductions (français / anglais) ---------- */
const I18N = {
  fr: {
    appTitle: "Votes du conseil municipal",
    loginLabel: "Clé de connexion",
    loginBtn: "Se connecter",
    loginBad: "Clé de connexion incorrecte.",
    loginNoCrypto: "Ce navigateur ne permet pas la vérification de la clé. Utilisez Firefox, Chrome ou Edge à jour.",
    export: "Exporter les résultats (CSV)",
    save: "Sauvegarder",
    open: "Ouvrir",
    logout: "Se déconnecter",
    tabPresence: "Séance & présences",
    tabVotes: "Votes",
    tabElus: "Liste des élus",
    footer: "Commune de Thue et Mue · Registre des votes du conseil municipal",
    subtitle: "{titre} du {date}",
    defaultSession: "Séance",

    statMembers: "En exercice",
    statPresent: "Présents",
    statRepresented: "Représentés",
    statAbsent: "Absents",
    statVoters: "Votants",
    quorum: "Quorum ({n} présents)",
    quorumOk: "Atteint",
    quorumKo: "Non atteint",

    session: "Séance",
    sessionTitle: "Intitulé",
    date: "Date",
    president: "Président de séance",
    attendance: "Présences et procurations",
    allPresent: "Tous présents",
    allAbsent: "Tous absents",
    proxyRule: "Un élu présent ne peut détenir qu'une seule procuration.",
    colMember: "Élu",
    colAttendance: "Présence",
    colProxy: "Procuration",
    present: "Présent",
    absent: "Absent",
    represented: "Représenté",
    proxyHolder: "Porteur de la procuration de",
    noProxy: "— Pas de procuration —",
    newSession: "Nouvelle séance (vide présences et votes)",

    newItem: "Nouvelle délibération",
    number: "Numéro",
    itemPlaceholder: "Objet de la délibération",
    add: "Ajouter",
    defaultFor: "Chaque votant est compté « Pour » par défaut ; ouvrez la délibération pour modifier les votes.",
    items: "Délibérations ({n})",
    noItems: "Aucune délibération pour le moment.",
    allFor: "Tous pour",
    allAgainst: "Tous contre",
    allAbst: "Tous abstention",
    viaProxy: "par procuration à {nom}",
    enterVotes: "Saisir les votes",
    close: "Fermer",
    delete: "Supprimer",

    choice_pour: "Pour",
    choice_contre: "Contre",
    choice_abst: "Abstention",
    choice_npp: "Ne prend pas part",
    short_npp: "NPPV",
    tallyAbst: "Abstentions",
    tallyNpp: "Ne prennent pas part",

    res_none: "Aucun suffrage exprimé",
    res_unanimous: "Adopté à l'unanimité",
    res_adopted: "Adopté",
    res_rejected: "Rejeté",
    res_adoptedCasting: "Adopté (voix prépondérante du président)",
    res_rejectedCasting: "Rejeté (voix prépondérante du président)",
    res_rejectedTie: "Rejeté (égalité)",

    addMember: "Ajouter un élu",
    namePlaceholder: "Prénom NOM",
    rolePlaceholder: "Fonction",
    members: "Élus ({n})",
    colName: "Nom",
    colRole: "Fonction",
    resetList: "Restaurer la liste d'origine",

    confirmNewSession: "Démarrer une nouvelle séance ? Les présences et votes actuels seront effacés (pensez à exporter).",
    confirmDelItem: "Supprimer cette délibération ?",
    confirmDelMember: "Supprimer {nom} de la liste ?",
    confirmReset: "Remplacer la liste par la liste d'origine ? Les présences et votes seront effacés.",
    invalidFile: "Fichier invalide.",

    csvMembers: "Membres en exercice",
    csvResults: "RÉSULTATS DES VOTES",
    csvNo: "N°",
    csvSubject: "Objet",
    csvResult: "Résultat",
    csvDetail: "DÉTAIL NOMINATIF",
    csvProxyTo: "Procuration donnée à",
    csvItem: "Délib. {n}",
    csvFile: "votes_conseil",
    jsonFile: "seance",
  },

  en: {
    appTitle: "Municipal council votes",
    loginLabel: "Access key",
    loginBtn: "Sign in",
    loginBad: "Incorrect access key.",
    loginNoCrypto: "This browser cannot check the key. Please use an up-to-date Firefox, Chrome or Edge.",
    export: "Export results (CSV)",
    save: "Save",
    open: "Open",
    logout: "Sign out",
    tabPresence: "Session & attendance",
    tabVotes: "Votes",
    tabElus: "Councillors",
    footer: "Municipality of Thue et Mue · Municipal council voting record",
    subtitle: "{titre} — {date}",
    defaultSession: "Session",

    statMembers: "Serving members",
    statPresent: "Present",
    statRepresented: "Represented",
    statAbsent: "Absent",
    statVoters: "Voters",
    quorum: "Quorum ({n} present)",
    quorumOk: "Reached",
    quorumKo: "Not reached",

    session: "Session",
    sessionTitle: "Title",
    date: "Date",
    president: "Chair of the session",
    attendance: "Attendance and proxies",
    allPresent: "All present",
    allAbsent: "All absent",
    proxyRule: "A present councillor may hold only one proxy.",
    colMember: "Councillor",
    colAttendance: "Attendance",
    colProxy: "Proxy",
    present: "Present",
    absent: "Absent",
    represented: "Represented",
    proxyHolder: "Holds the proxy of",
    noProxy: "— No proxy —",
    newSession: "New session (clears attendance and votes)",

    newItem: "New resolution",
    number: "Number",
    itemPlaceholder: "Subject of the resolution",
    add: "Add",
    defaultFor: "Every voter is counted “For” by default; open the resolution to change the votes.",
    items: "Resolutions ({n})",
    noItems: "No resolutions yet.",
    allFor: "All for",
    allAgainst: "All against",
    allAbst: "All abstain",
    viaProxy: "by proxy to {nom}",
    enterVotes: "Enter votes",
    close: "Close",
    delete: "Delete",

    choice_pour: "For",
    choice_contre: "Against",
    choice_abst: "Abstention",
    choice_npp: "Not voting",
    short_npp: "Not voting",
    tallyAbst: "Abstentions",
    tallyNpp: "Not voting",

    res_none: "No votes cast",
    res_unanimous: "Adopted unanimously",
    res_adopted: "Adopted",
    res_rejected: "Rejected",
    res_adoptedCasting: "Adopted (chair's casting vote)",
    res_rejectedCasting: "Rejected (chair's casting vote)",
    res_rejectedTie: "Rejected (tie)",

    addMember: "Add a councillor",
    namePlaceholder: "First name LAST NAME",
    rolePlaceholder: "Role",
    members: "Councillors ({n})",
    colName: "Name",
    colRole: "Role",
    resetList: "Restore the original list",

    confirmNewSession: "Start a new session? Current attendance and votes will be cleared (remember to export).",
    confirmDelItem: "Delete this resolution?",
    confirmDelMember: "Remove {nom} from the list?",
    confirmReset: "Replace the list with the original one? Attendance and votes will be cleared.",
    invalidFile: "Invalid file.",

    csvMembers: "Serving members",
    csvResults: "VOTING RESULTS",
    csvNo: "No.",
    csvSubject: "Subject",
    csvResult: "Result",
    csvDetail: "INDIVIDUAL VOTES",
    csvProxyTo: "Proxy given to",
    csvItem: "Res. {n}",
    csvFile: "council_votes",
    jsonFile: "session",
  },
};

const LANG_KEY = "vote-cm-lang";
let lang = "fr";
try { if (I18N[localStorage.getItem(LANG_KEY)]) lang = localStorage.getItem(LANG_KEY); } catch (e) {}

// Renvoie le texte traduit ; {nom} est remplacé par params.nom
function t(key, params) {
  let s = I18N[lang][key] ?? I18N.fr[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
  return s;
}

// Traduit les éléments fixes de la page (attribut data-i18n)
function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t("appTitle");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll(".lang button").forEach(b => b.classList.toggle("on", b.dataset.val === lang));
}

function setLang(l) {
  if (!I18N[l]) return;
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  applyStatic();
  if (!document.body.classList.contains("locked")) render();
}

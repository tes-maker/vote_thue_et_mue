/**
 * Schémas de validation (zod) des données échangées avec l'API.
 *
 * Ils définissent le format d'une séance et ses règles de cohérence : tout ce
 * qui entre en base ou en sort passe par ici. Les messages servent de
 * documentation des règles ; le client ne reçoit que le code `invalid_data`.
 */
const { z } = require("zod");

/** Adapte `check(valeur, refuser)` à l'interface `superRefine` de zod. */
const rule = check => (value, context) => check(
  value,
  message => context.addIssue({ code: "custom", message }),
);
const hasDuplicates = values => new Set(values).size !== values.length;

const idSchema = z.string().regex(/^[a-z0-9]+$/).max(64);

/** Élu. `actif` vaut false pour un démissionnaire ; absent des anciennes données, il vaut true. */
const memberSchema = z.object({
  id: idSchema,
  nom: z.string().max(255),
  fonction: z.string().max(500),
  actif: z.boolean().default(true),
});

/** Présence d'un élu. `mandataire` est l'élu présent qui porte sa procuration. */
const attendanceSchema = z.object({
  present: z.boolean(),
  mandataire: idSchema.nullable(),
});

/**
 * Vote nominal. `electeurs` et `president` sont figés à la création du vote :
 * corriger la liste des élus ou les présences ne modifie pas un vote existant.
 */
const voteSchema = z.object({
  id: idSchema,
  numero: z.string().max(50),
  objet: z.string().max(5000),
  choix: z.record(idSchema, z.enum(["pour", "contre", "abst", "npp"])),
  electeurs: z.array(memberSchema.extend(attendanceSchema.shape)).max(200),
  president: idSchema.nullable(),
});

const confidentialOptionSchema = z.object({
  id: idSchema,
  nom: z.string().trim().min(1).max(255),
  voix: z.number().int().min(0).max(200),
});

/**
 * Vote confidentiel : uniquement des compteurs anonymes, plafonnés par `limite`.
 * `structures` est l'ancien nom de `options`, encore présent dans d'anciennes
 * données ; il est accepté en entrée et renvoyé sous le nom `options`.
 */
const confidentialVoteSchema = z.object({
  id: idSchema,
  numero: z.string().max(50),
  objet: z.string().max(5000),
  limite: z.number().int().min(0).max(200),
  options: z.array(confidentialOptionSchema).max(200).optional(),
  structures: z.array(confidentialOptionSchema).max(200).optional(),
  abstentions: z.number().int().min(0).max(200),
  npp: z.number().int().min(0).max(200),
}).superRefine(rule((vote, refuse) => {
  if (vote.options && vote.structures) refuse("Options et structures ne peuvent pas coexister.");
  const options = vote.options ?? vote.structures ?? [];
  if (hasDuplicates(options.map(option => option.id))) refuse("Une option est présente plusieurs fois.");
  const total = options.reduce((sum, option) => sum + option.voix, vote.abstentions + vote.npp);
  if (total > vote.limite) refuse("Le nombre de bulletins dépasse le nombre d'élus autorisés.");
})).transform(({ structures, ...vote }) => ({
  ...vote,
  options: vote.options ?? structures ?? [],
}));

/** Séance complète : c'est le document enregistré dans `app_state` et dans les archives. */
const sessionSchema = z.object({
  elus: z.array(memberSchema).max(200),
  seance: z.object({
    id: idSchema,
    titre: z.string().max(255),
    date: z.iso.date(),
    president: idSchema.nullable(),
  }),
  presence: z.record(idSchema, attendanceSchema),
  votes: z.array(voteSchema).max(2000),
  votesConfidentiels: z.array(confidentialVoteSchema).max(2000).default([]),
}).superRefine(rule((state, refuse) => {
  const members = new Map(state.elus.map(member => [member.id, member]));
  if (members.size !== state.elus.length) refuse("La liste contient des identifiants d'élus en double.");
  if (state.seance.president && !members.get(state.seance.president)?.actif) {
    refuse("Le président doit être en exercice.");
  }

  if (Object.keys(state.presence).length !== members.size
    || state.elus.some(member => !Object.hasOwn(state.presence, member.id))) {
    // Inutile de poursuivre : les règles suivantes lisent la présence de chaque élu.
    refuse("Les présences ne correspondent pas à la liste des élus.");
    return;
  }
  for (const member of state.elus) {
    const { present, mandataire } = state.presence[member.id];
    if (!member.actif && (present || mandataire)) refuse("Un démissionnaire ne peut pas participer à la séance.");
    if (mandataire && (present || !members.get(mandataire)?.actif || !state.presence[mandataire]?.present)) {
      refuse("Une procuration doit être portée par un élu présent.");
    }
  }

  if (hasDuplicates(state.votes.map(vote => vote.id))) refuse("La liste contient des votes en double.");
  for (const vote of state.votes) {
    const electorate = new Map(vote.electeurs.map(voter => [voter.id, voter]));
    if (electorate.size !== vote.electeurs.length) refuse("Un vote contient des électeurs en double.");
    for (const voter of vote.electeurs) {
      if (voter.mandataire && (voter.present || !electorate.get(voter.mandataire)?.present)) {
        refuse("Une procuration de vote doit être portée par un élu présent.");
      }
    }
    if (Object.keys(vote.choix).some(id => !electorate.has(id))) {
      refuse("Un choix de vote ne correspond à aucun électeur.");
    }
  }

  if (hasDuplicates(state.votesConfidentiels.map(vote => vote.id))) {
    refuse("La liste contient des votes confidentiels en double.");
  }
}));

/** Séance archivée : son identifiant est toujours celui de la séance. */
const archiveSchema = z.object({
  id: idSchema,
  // Accepte aussi le décalage « +00:00 » renvoyé par GET /state, pour qu'un export se réimporte.
  archivedAt: z.iso.datetime({ offset: true }),
  snapshot: sessionSchema,
}).refine(archive => archive.id === archive.snapshot.seance.id, {
  message: "L'identifiant de l'archive ne correspond pas à la séance.",
});

const mandateSchema = z.object({
  startYear: z.number().int().min(1900).max(9999),
  endYear: z.number().int().min(1900).max(9999),
}).refine(mandate => mandate.endYear > mandate.startYear, {
  message: "L'année de fin doit être supérieure à l'année de début.",
});

/** `create` remplace le mandat courant en conservant l'ancien ; `edit` le corrige sur place. */
const mandateInputSchema = mandateSchema.safeExtend({
  mode: z.enum(["create", "edit"]),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  password: z.string().min(1).max(72),
});

/** Confirmation du mot de passe avant une suppression (authentification renforcée). */
const elevateSchema = z.object({
  password: z.string().min(1).max(72),
});

module.exports = {
  archiveSchema,
  elevateSchema,
  idSchema,
  loginSchema,
  mandateInputSchema,
  mandateSchema,
  sessionSchema,
};

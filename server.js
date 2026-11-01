require("dotenv").config({ path: process.env.APP_ENV_FILE || ".env" });

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const connectPgSimple = require("connect-pg-simple");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const session = require("express-session");
const helmet = require("helmet");
const { Pool } = require("pg");
const { z } = require("zod");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL doit être défini.");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET doit comporter au moins 32 caractères.");
}
if (process.env.API_BEARER_TOKEN && Buffer.byteLength(process.env.API_BEARER_TOKEN, "utf8") < 32) {
  throw new Error("API_BEARER_TOKEN doit comporter au moins 32 caractères.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT invalide.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", error => console.error("Erreur de connexion PostgreSQL :", error));
const PgSessionStore = connectPgSimple(session);
const idSchema = z.string().regex(/^[a-z0-9]+$/).max(64);
const memberSchema = z.object({
  id: idSchema,
  nom: z.string().max(255),
  fonction: z.string().max(500),
  actif: z.boolean().default(true),
});
const attendanceSchema = z.object({
  present: z.boolean(),
  mandataire: idSchema.nullable(),
});
const voterSchema = memberSchema.extend({
  present: z.boolean(),
  mandataire: idSchema.nullable(),
});
const voteSchema = z.object({
  id: idSchema,
  numero: z.string().max(50),
  objet: z.string().max(5000),
  choix: z.record(idSchema, z.enum(["pour", "contre", "abst", "npp"])),
  electeurs: z.array(voterSchema).max(200),
  president: idSchema.nullable(),
});
const confidentialOptionSchema = z.object({
  id: idSchema,
  nom: z.string().trim().min(1).max(255),
  voix: z.number().int().min(0).max(200),
});
const confidentialVoteSchema = z.object({
  id: idSchema,
  numero: z.string().max(50),
  objet: z.string().max(5000),
  limite: z.number().int().min(0).max(200),
  options: z.array(confidentialOptionSchema).max(200).optional(),
  structures: z.array(confidentialOptionSchema).max(200).optional(),
  abstentions: z.number().int().min(0).max(200),
  npp: z.number().int().min(0).max(200),
}).superRefine((vote, context) => {
  if (vote.options && vote.structures) {
    context.addIssue({ code: "custom", message: "Le vote confidentiel ne peut définir options et structures simultanément." });
  }
  const options = vote.options ?? vote.structures ?? [];
  const optionIds = new Set(options.map(option => option.id));
  if (optionIds.size !== options.length) {
    context.addIssue({ code: "custom", message: "Une option est présente plusieurs fois dans le vote confidentiel." });
  }
  const total = options.reduce((sum, option) => sum + option.voix, vote.abstentions + vote.npp);
  if (total > vote.limite) {
    context.addIssue({ code: "custom", message: "Le nombre de bulletins dépasse le nombre d'élus autorisés." });
  }
}).transform(({ structures, ...vote }) => ({
  ...vote,
  options: vote.options ?? structures ?? [],
}));
const sessionSchema = z.object({
  elus: z.array(memberSchema).max(200),
  seance: z.object({
    id: idSchema,
    titre: z.string().max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    president: idSchema.nullable(),
  }),
  presence: z.record(idSchema, attendanceSchema),
  votes: z.array(voteSchema).max(2000),
  votesConfidentiels: z.array(confidentialVoteSchema).max(2000).default([]),
}).superRefine((state, context) => {
  const memberIds = new Set(state.elus.map(member => member.id));
  const membersById = new Map(state.elus.map(member => [member.id, member]));
  if (memberIds.size !== state.elus.length) {
    context.addIssue({ code: "custom", message: "La liste contient des identifiants d'élus en double." });
  }
  if (state.seance.president && !membersById.get(state.seance.president)?.actif) {
    context.addIssue({ code: "custom", message: "Le président doit être en exercice." });
  }
  if (Object.keys(state.presence).length !== memberIds.size
    || state.elus.some(member => !Object.hasOwn(state.presence, member.id))) {
    context.addIssue({ code: "custom", message: "Les présences ne correspondent pas à la liste des élus." });
  }
  for (const member of state.elus) {
    const attendance = state.presence[member.id];
    if (!member.actif && (attendance.present || attendance.mandataire)) {
      context.addIssue({ code: "custom", message: "Un membre démissionnaire ne peut pas participer à la séance." });
    }
    if (attendance.mandataire
      && (!member.actif || attendance.present || !membersById.get(attendance.mandataire)?.actif
        || !state.presence[attendance.mandataire]?.present)) {
      context.addIssue({ code: "custom", message: "Une procuration doit être portée par un élu présent." });
    }
  }
  const parsedDate = Date.parse(`${state.seance.date}T00:00:00Z`);
  if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== state.seance.date) {
    context.addIssue({ code: "custom", message: "La date de séance est invalide." });
  }
  const voteIds = new Set();
  for (const vote of state.votes) {
    if (voteIds.has(vote.id)) context.addIssue({ code: "custom", message: "La liste contient des votes en double." });
    voteIds.add(vote.id);
    const voterIds = new Set(vote.electeurs.map(voter => voter.id));
    if (voterIds.size !== vote.electeurs.length) {
      context.addIssue({ code: "custom", message: "Un vote contient des électeurs en double." });
    }
    const electorate = new Map(vote.electeurs.map(voter => [voter.id, voter]));
    for (const voter of vote.electeurs) {
      if (voter.mandataire
        && (voter.present || !electorate.get(voter.mandataire)?.present)) {
        context.addIssue({ code: "custom", message: "Une procuration de vote doit être portée par un élu présent." });
      }
    }
    if (Object.keys(vote.choix).some(id => !voterIds.has(id))) {
      context.addIssue({ code: "custom", message: "Un choix de vote ne correspond à aucun électeur." });
    }
  }
  const confidentialVoteIds = new Set();
  for (const vote of state.votesConfidentiels) {
    if (confidentialVoteIds.has(vote.id)) {
      context.addIssue({ code: "custom", message: "La liste contient des votes confidentiels en double." });
    }
    confidentialVoteIds.add(vote.id);
  }
});
const archiveSchema = z.object({
  id: idSchema,
  archivedAt: z.string().datetime(),
  snapshot: sessionSchema,
}).superRefine((archive, context) => {
  if (archive.id !== archive.snapshot.seance.id) {
    context.addIssue({ code: "custom", message: "L'identifiant de l'archive ne correspond pas à la séance." });
  }
});

function sendError(res, status, code) {
  return res.status(status).json({ error: code });
}

function validate(schema, value, res) {
  const result = schema.safeParse(value);
  if (!result.success) {
    sendError(res, 400, "invalid_data");
    return null;
  }
  return result.data;
}

function requireAuth(req, res, next) {
  if (isValidApiToken(req.get("Authorization"), process.env.API_BEARER_TOKEN)) {
    req.apiAuthenticated = true;
    req.authUserId = null;
    return next();
  }
  return requireSessionAuth(req, res, next);
}

function requireSessionAuth(req, res, next) {
  if (req.session?.userId) {
    req.authUserId = req.session.userId;
    return next();
  }
  return sendError(res, 401, "unauthorized");
}

function isValidApiToken(authorization, expectedToken) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
  if (!expectedToken || !match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function requireCsrf(req, res, next) {
  if (req.apiAuthenticated) return next();
  const token = req.get("X-CSRF-Token");
  const provided = Buffer.from(token ?? "");
  const expected = Buffer.from(req.session.csrfToken ?? "");
  if (!token || !req.session.csrfToken || provided.length !== expected.length
    || !crypto.timingSafeEqual(provided, expected)) {
    return sendError(res, 403, "csrf_invalid");
  }
  next();
}

function expectedRevision(req, res) {
  const raw = req.get("If-Match")?.replace(/^"|"$/g, "");
  if (raw === undefined || !/^\d+$/.test(raw)) {
    sendError(res, 428, "revision_required");
    return null;
  }
  const revision = Number(raw);
  if (!Number.isSafeInteger(revision)) {
    sendError(res, 400, "invalid_revision");
    return null;
  }
  return revision;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkRevision(client, revision) {
  const result = await client.query("SELECT revision FROM app_state WHERE id = 1 FOR UPDATE");
  const actual = result.rows[0] ? Number(result.rows[0].revision) : 0;
  if (actual !== revision) return null;
  return actual;
}

async function storeState(client, active, userId, revision, action = "state.updated") {
  const nextRevision = revision + 1;
  const result = revision === 0
    ? await client.query(
        `INSERT INTO app_state (id, payload, revision, updated_by)
         VALUES (1, $1::jsonb, 1, $2)
         ON CONFLICT (id) DO NOTHING RETURNING revision`,
        [JSON.stringify(active), userId],
      )
    : await client.query(
        `UPDATE app_state SET payload = $1::jsonb, revision = $2,
          updated_at = NOW(), updated_by = $3
         WHERE id = 1 AND revision = $4 RETURNING revision`,
        [JSON.stringify(active), nextRevision, userId, revision],
      );
  if (!result.rows[0]) return null;
  await client.query(
    "INSERT INTO audit_log (user_id, action) VALUES ($1, $2)",
    [userId, action],
  );
  return Number(result.rows[0].revision);
}

function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: "10mb", type: "application/json" }));
  app.use(session({
    name: isProduction ? "__Host-vote-cm" : "vote-cm.sid",
    secret: process.env.SESSION_SECRET,
    store: new PgSessionStore({ pool, createTableIfMissing: true, tableName: "user_sessions" }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.get(["/api/health", "/api/v1/health"], async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
    try {
      const input = validate(z.object({
        email: z.string().email().max(255),
        password: z.string().min(1).max(72),
      }), req.body, res);
      if (!input) return;
      if (Buffer.byteLength(input.password, "utf8") > 72) return sendError(res, 400, "invalid_credentials");
      const result = await pool.query(
        "SELECT id, email, password_hash FROM app_users WHERE email = $1",
        [input.email.trim().toLowerCase()],
      );
      const user = result.rows[0];
      const valid = user
        ? await bcrypt.compare(input.password, user.password_hash)
        : await bcrypt.compare(input.password, "$2a$12$C6UzMDM.H6dfI/f/IKcEe.8G0kz3fg5hQbQ6Hb0EkmBHv6GZG2fCW");
      if (!user || !valid) return sendError(res, 401, "invalid_credentials");

      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
        req.session.save(saveError => {
          if (saveError) return next(saveError);
          res.json({ user: { email: user.email }, csrfToken: req.session.csrfToken });
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.json({ user: { email: req.session.userEmail }, csrfToken: req.session.csrfToken });
  });

  app.post("/api/auth/logout", requireSessionAuth, requireCsrf, (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie(isProduction ? "__Host-vote-cm" : "vote-cm.sid", {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
      });
      res.status(204).end();
    });
  });

  app.get(["/api/state", "/api/v1/state"], requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
          (SELECT payload FROM app_state WHERE id = 1) AS active,
          COALESCE((SELECT revision FROM app_state WHERE id = 1), 0) AS revision,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', session_id, 'archivedAt', archived_at, 'snapshot', snapshot)
              ORDER BY archived_at DESC
            )
            FROM session_archives
          ), '[]'::jsonb) AS history`,
      );
      const row = result.rows[0];
      const active = row.active === null ? null : sessionSchema.parse(row.active);
      res.json({
        active,
        history: row.history.map(archive => ({
          ...archive,
          snapshot: sessionSchema.parse(archive.snapshot),
        })),
        revision: Number(row.revision),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put(["/api/state", "/api/v1/state"], requireAuth, requireCsrf, async (req, res, next) => {
    const revision = expectedRevision(req, res);
    if (revision === null) return;
    const active = validate(sessionSchema, req.body?.active, res);
    if (!active) return;
    try {
      const result = await transaction(async client => {
        const actual = await checkRevision(client, revision);
        if (actual === null) return null;
        return storeState(client, active, req.authUserId, actual);
      });
      if (result === null) return sendError(res, 409, "state_conflict");
      res.json({ revision: result });
    } catch (error) {
      next(error);
    }
  });

  app.post(["/api/archive", "/api/v1/archive"], requireAuth, requireCsrf, async (req, res, next) => {
    const revision = expectedRevision(req, res);
    if (revision === null) return;
    try {
      const result = await transaction(async client => {
        const stateResult = await client.query("SELECT payload, revision FROM app_state WHERE id = 1 FOR UPDATE");
        const row = stateResult.rows[0];
        if (!row || Number(row.revision) !== revision) return null;
        const snapshot = validate(sessionSchema, row.payload, res);
        if (!snapshot) return false;
        const archive = {
          id: snapshot.seance.id,
          archivedAt: new Date().toISOString(),
          snapshot,
        };
        await client.query(
          `INSERT INTO session_archives (session_id, archived_at, snapshot, archived_by)
           VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (session_id) DO UPDATE
           SET archived_at = EXCLUDED.archived_at, snapshot = EXCLUDED.snapshot,
               archived_by = EXCLUDED.archived_by`,
          [archive.id, archive.archivedAt, JSON.stringify(snapshot), req.authUserId],
        );
        const nextRevision = revision + 1;
        await client.query(
          "UPDATE app_state SET revision = $1, updated_at = NOW(), updated_by = $2 WHERE id = 1",
          [nextRevision, req.authUserId],
        );
        await client.query(
          "INSERT INTO audit_log (user_id, action) VALUES ($1, 'session.archived')",
          [req.authUserId],
        );
        return { archive, revision: nextRevision };
      });
      if (result === null) return sendError(res, 409, "state_conflict");
      if (result === false) return;
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put(["/api/state/import", "/api/v1/state/import"], requireAuth, requireCsrf, async (req, res, next) => {
    const revision = expectedRevision(req, res);
    if (revision === null) return;
    const active = validate(sessionSchema, req.body?.active, res);
    if (!active) return;
    const history = validate(z.array(archiveSchema).max(5000), req.body?.history, res);
    if (!history) return;
    try {
      const result = await transaction(async client => {
        const actual = await checkRevision(client, revision);
        if (actual === null) return null;
        const nextRevision = await storeState(client, active, req.authUserId, actual, "state.imported");
        if (nextRevision === null) return null;
        for (const archive of history) {
          await client.query(
            `INSERT INTO session_archives (session_id, archived_at, snapshot, archived_by)
             VALUES ($1, $2, $3::jsonb, $4)
             ON CONFLICT (session_id) DO UPDATE
             SET archived_at = EXCLUDED.archived_at, snapshot = EXCLUDED.snapshot,
                 archived_by = EXCLUDED.archived_by`,
            [archive.id, archive.archivedAt, JSON.stringify(archive.snapshot), req.authUserId],
          );
        }
        return nextRevision;
      });
      if (result === null) return sendError(res, 409, "state_conflict");
      res.json({ revision: result });
    } catch (error) {
      next(error);
    }
  });

  const tabRoutes = new Set(["presence", "votes", "confidential", "elus", "history"]);
  app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));
  app.get("/:tab", (req, res, next) => {
    if (!tabRoutes.has(req.params.tab)) return next();
    res.sendFile(path.join(ROOT, "index.html"));
  });
  const publicFiles = new Set([
    "style.css", "logo_eu.png", "logo_thue_et_mue.png",
    "logo_thue_et_mue.svg", "logo_thue_et_mue_dark.svg",
    "rf_logo.svg", "rf_logo_dark.svg", "image.png",
  ]);
  app.get("/:file", (req, res, next) => {
    if (!publicFiles.has(req.params.file)) return next();
    res.sendFile(path.join(ROOT, req.params.file));
  });
  app.use("/js", express.static(path.join(ROOT, "js"), { dotfiles: "deny", index: false, maxAge: 0 }));
  app.use("/api", (_req, res) => sendError(res, 404, "not_found"));
  app.use((_req, res) => res.status(404).send("Introuvable"));
  app.use((error, _req, res, _next) => {
    console.error("Erreur serveur :", error);
    if (res.headersSent) return;
    sendError(res, 500, "server_error");
  });
  return app;
}

async function main() {
  const migration = await fs.readFile(path.join(ROOT, "server/schema.sql"), "utf8");
  await pool.query(migration);
  const server = createApp().listen(PORT, HOST, () => {
    console.log(`Application disponible sur http://${HOST}:${PORT}`);
  });
  const shutdown = () => server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main().catch(error => {
    console.error("Démarrage impossible :", error);
    process.exitCode = 1;
  });
}

module.exports = {
  createApp,
  sessionSchema,
  archiveSchema,
  confidentialVoteSchema,
  isValidApiToken,
  requireAuth,
  requireCsrf,
};

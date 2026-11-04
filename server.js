/**
 * Serveur HTTP : API JSON (documentée dans endpoints.md) et fichiers de l'interface.
 *
 * Organisation : configuration, middlewares de protection, accès à la base,
 * puis routes dans createApp(). Une route signale une erreur attendue en levant
 * HttpError ; Express 5 transmet les rejets au gestionnaire d'erreurs final.
 */
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
const {
  archiveSchema,
  loginSchema,
  mandateInputSchema,
  sessionSchema,
} = require("./server/schemas");

/* ---------- configuration ---------- */
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

const SESSION_COOKIE_NAME = isProduction ? "__Host-vote-cm" : "vote-cm.sid";
const SESSION_COOKIE = { httpOnly: true, secure: isProduction, sameSite: "strict", path: "/" };
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** Comparé lorsque le compte n'existe pas, pour que la réponse prenne le même temps. */
const UNKNOWN_USER_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.8G0kz3fg5hQbQ6Hb0EkmBHv6GZG2fCW";
/** Sérialise les écritures du mandat : voir la route PUT /mandate. */
const MANDATE_LOCK_ID = 948377;

/** Adresses des onglets, servies par la même page (voir js/render.js). */
const TAB_ROUTES = new Set(["presence", "votes", "confidential", "elus", "history"]);
/** Seuls ces fichiers de la racine sont publics : .env et le code serveur ne doivent jamais l'être. */
const PUBLIC_FILES = new Set([
  "style.css", "logo_thue_et_mue.png", "logo_thue_et_mue.svg",
  "logo_thue_et_mue_dark.svg", "rf_logo.svg", "rf_logo_dark.svg",
]);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", error => console.error("Erreur de connexion PostgreSQL :", error));
const PgSessionStore = connectPgSimple(session);

/* ---------- erreurs et validation ---------- */

/** Erreur attendue, renvoyée au client sous la forme `{ "error": code }`. */
class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "invalid_data");
  return result.data;
}

/* ---------- protections des routes ---------- */

/** Comparaison en temps constant, pour ne pas révéler un secret par le temps de réponse. */
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isValidApiToken(authorization, expectedToken) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
  return Boolean(expectedToken && match) && safeEqual(match[1], expectedToken);
}

function requireSession(req, _res, next) {
  if (!req.session?.userId) throw new HttpError(401, "unauthorized");
  req.authUserId = req.session.userId;
  next();
}

/** Accepte le jeton bearer des intégrations ou, à défaut, une session. */
function requireAuth(req, res, next) {
  if (!isValidApiToken(req.get("Authorization"), process.env.API_BEARER_TOKEN)) {
    return requireSession(req, res, next);
  }
  req.apiAuthenticated = true;
  req.authUserId = null;
  next();
}

/** Le jeton CSRF ne concerne que les sessions : un cookie part tout seul, pas un jeton bearer. */
function requireCsrf(req, _res, next) {
  const token = req.get("X-CSRF-Token");
  const valid = token && req.session.csrfToken && safeEqual(token, req.session.csrfToken);
  if (!req.apiAuthenticated && !valid) throw new HttpError(403, "csrf_invalid");
  next();
}

/** Lit dans If-Match la révision connue du client (verrouillage optimiste). */
function requireRevision(req, _res, next) {
  const raw = req.get("If-Match")?.replace(/^"|"$/g, "") ?? "";
  if (!/^\d+$/.test(raw)) throw new HttpError(428, "revision_required");
  req.expectedRevision = Number(raw);
  if (!Number.isSafeInteger(req.expectedRevision)) throw new HttpError(400, "invalid_revision");
  next();
}

/** Protections de toute route d'écriture du registre. */
const guardedWrite = [requireAuth, requireCsrf, requireRevision];

/* ---------- accès à la base ---------- */

/** Exécute callback dans une transaction, annulée si une erreur est levée. */
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

function audit(client, userId, action) {
  return client.query("INSERT INTO audit_log (user_id, action) VALUES ($1, $2)", [userId, action]);
}

/**
 * Enregistre la séance active si la révision attendue est toujours la bonne et
 * renvoie la nouvelle révision. La révision 0 désigne une base encore vide.
 * La condition est portée par la requête elle-même : de deux écritures
 * concurrentes sur la même révision, une seule modifie une ligne.
 */
async function saveActiveState(client, active, userId, revision, action = "state.updated") {
  const payload = JSON.stringify(active);
  const result = revision === 0
    ? await client.query(
        `INSERT INTO app_state (id, payload, revision, updated_by)
         VALUES (1, $1::jsonb, 1, $2)
         ON CONFLICT (id) DO NOTHING RETURNING revision`,
        [payload, userId],
      )
    : await client.query(
        `UPDATE app_state SET payload = $1::jsonb, revision = revision + 1,
           updated_at = NOW(), updated_by = $2
         WHERE id = 1 AND revision = $3 RETURNING revision`,
        [payload, userId, revision],
      );
  if (!result.rows[0]) throw new HttpError(409, "state_conflict");
  await audit(client, userId, action);
  return Number(result.rows[0].revision);
}

/** Une séance n'a qu'une archive : archiver à nouveau remplace la précédente. */
function saveArchive(client, { id, archivedAt, snapshot }, userId) {
  return client.query(
    `INSERT INTO session_archives (session_id, archived_at, snapshot, archived_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (session_id) DO UPDATE
     SET archived_at = EXCLUDED.archived_at, snapshot = EXCLUDED.snapshot,
         archived_by = EXCLUDED.archived_by`,
    [id, archivedAt, JSON.stringify(snapshot), userId],
  );
}

function mandateResponse(row) {
  return {
    mandate: { id: String(row.id), startYear: row.start_year, endYear: row.end_year },
    revision: Number(row.revision),
  };
}

/* ---------- application ---------- */

/** Toute route publique existe avec et sans préfixe de version. */
const versioned = route => [`/api${route}`, `/api/v1${route}`];

/** Version « promesse » de session.regenerate, session.save et session.destroy. */
const sessionCall = (req, method) => new Promise((resolve, reject) => {
  req.session[method](error => (error ? reject(error) : resolve()));
});

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
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"], // police Marianne, voir style.css
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
  app.use((error, _req, _res, next) => {
    next(error.type === "entity.parse.failed" ? new HttpError(400, "invalid_data") : error);
  });
  app.use(session({
    name: SESSION_COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    store: new PgSessionStore({ pool, createTableIfMissing: true, tableName: "user_sessions" }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...SESSION_COOKIE, maxAge: SESSION_MAX_AGE_MS },
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  /* ----- santé et authentification ----- */

  app.get(versioned("/health"), async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    // bcrypt ignore ce qui dépasse 72 octets, or zod compte ici des caractères.
    if (Buffer.byteLength(password, "utf8") > 72) throw new HttpError(400, "invalid_credentials");
    const result = await pool.query(
      "SELECT id, email, password_hash FROM app_users WHERE email = $1",
      [email.trim().toLowerCase()],
    );
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user?.password_hash ?? UNKNOWN_USER_HASH);
    if (!user || !valid) throw new HttpError(401, "invalid_credentials");

    // Nouvel identifiant de session à la connexion, contre la fixation de session.
    await sessionCall(req, "regenerate");
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    await sessionCall(req, "save");
    res.json({ user: { email: user.email }, csrfToken: req.session.csrfToken });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    res.json({ user: { email: req.session.userEmail }, csrfToken: req.session.csrfToken });
  });

  app.post("/api/auth/logout", requireSession, requireCsrf, async (req, res) => {
    await sessionCall(req, "destroy");
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE);
    res.status(204).end();
  });

  /* ----- mandat ----- */

  app.get(versioned("/mandate"), requireAuth, async (_req, res) => {
    const result = await pool.query(
      "SELECT id, start_year, end_year, revision FROM mandate_periods WHERE is_current = TRUE",
    );
    if (!result.rows[0]) throw new Error("Aucun mandat courant n'est configuré.");
    res.json(mandateResponse(result.rows[0]));
  });

  app.put(versioned("/mandate"), guardedWrite, async (req, res) => {
    const { mode, startYear, endYear } = parse(mandateInputSchema, req.body);
    const nextRevision = req.expectedRevision + 1;
    const body = await transaction(async client => {
      // Verrou global plutôt que FOR UPDATE : une création retire à la ligne son
      // statut courant, et une requête concurrente en attente ne la retrouverait plus.
      await client.query("SELECT pg_advisory_xact_lock($1)", [MANDATE_LOCK_ID]);
      const current = (await client.query(
        "SELECT id, revision FROM mandate_periods WHERE is_current = TRUE",
      )).rows[0];
      if (!current) throw new Error("Aucun mandat courant n'est configuré.");
      if (Number(current.revision) !== req.expectedRevision) throw new HttpError(409, "mandate_conflict");

      let saved;
      if (mode === "create") {
        await client.query("UPDATE mandate_periods SET is_current = FALSE WHERE id = $1", [current.id]);
        saved = await client.query(
          `INSERT INTO mandate_periods (start_year, end_year, revision, updated_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, start_year, end_year, revision`,
          [startYear, endYear, nextRevision, req.authUserId],
        );
      } else {
        saved = await client.query(
          `UPDATE mandate_periods
           SET start_year = $1, end_year = $2, revision = $3, updated_by = $4
           WHERE id = $5
           RETURNING id, start_year, end_year, revision`,
          [startYear, endYear, nextRevision, req.authUserId, current.id],
        );
      }
      await audit(client, req.authUserId, mode === "create" ? "mandate.created" : "mandate.updated");
      return mandateResponse(saved.rows[0]);
    });
    res.json(body);
  });

  /* ----- séance active et archives ----- */

  app.get(versioned("/state"), requireAuth, async (_req, res) => {
    const { rows: [row] } = await pool.query(
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
    // Relire avec le schéma met aussi les anciennes données au format actuel.
    res.json({
      active: row.active === null ? null : sessionSchema.parse(row.active),
      history: row.history.map(archive => ({ ...archive, snapshot: sessionSchema.parse(archive.snapshot) })),
      revision: Number(row.revision),
    });
  });

  app.put(versioned("/state"), guardedWrite, async (req, res) => {
    const active = parse(sessionSchema, req.body?.active);
    const revision = await transaction(client => (
      saveActiveState(client, active, req.authUserId, req.expectedRevision)
    ));
    res.json({ revision });
  });

  app.post(versioned("/archive"), guardedWrite, async (req, res) => {
    const body = await transaction(async client => {
      // Verrou conservé jusqu'au COMMIT : la séance archivée est celle de cette révision.
      const { rows: [row] } = await client.query("SELECT payload, revision FROM app_state WHERE id = 1 FOR UPDATE");
      if (Number(row?.revision) !== req.expectedRevision) throw new HttpError(409, "state_conflict");
      const snapshot = parse(sessionSchema, row.payload);
      const archive = { id: snapshot.seance.id, archivedAt: new Date().toISOString(), snapshot };
      await saveArchive(client, archive, req.authUserId);
      const nextRevision = req.expectedRevision + 1;
      await client.query(
        "UPDATE app_state SET revision = $1, updated_at = NOW(), updated_by = $2 WHERE id = 1",
        [nextRevision, req.authUserId],
      );
      await audit(client, req.authUserId, "session.archived");
      return { archive, revision: nextRevision };
    });
    res.json(body);
  });

  app.put(versioned("/state/import"), guardedWrite, async (req, res) => {
    const active = parse(sessionSchema, req.body?.active);
    const history = parse(z.array(archiveSchema).max(5000), req.body?.history);
    const revision = await transaction(async client => {
      const next = await saveActiveState(client, active, req.authUserId, req.expectedRevision, "state.imported");
      for (const archive of history) await saveArchive(client, archive, req.authUserId);
      return next;
    });
    res.json({ revision });
  });

  /* ----- interface web et cas restants ----- */

  const sendIndex = (_req, res) => res.sendFile(path.join(ROOT, "index.html"));
  app.get("/", sendIndex);
  app.get("/:name", (req, res, next) => {
    if (TAB_ROUTES.has(req.params.name)) return sendIndex(req, res);
    if (PUBLIC_FILES.has(req.params.name)) return res.sendFile(path.join(ROOT, req.params.name));
    next();
  });
  app.use("/js", express.static(path.join(ROOT, "js"), { dotfiles: "deny", index: false, maxAge: 0 }));
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
  app.use((_req, res) => res.status(404).send("Introuvable"));
  app.use((error, _req, res, _next) => {
    if (!(error instanceof HttpError)) console.error("Erreur serveur :", error);
    if (res.headersSent) return;
    res.status(error instanceof HttpError ? error.status : 500)
      .json({ error: error instanceof HttpError ? error.code : "server_error" });
  });
  return app;
}

/** Applique le schéma (idempotent), puis démarre le serveur jusqu'à SIGTERM ou SIGINT. */
async function main() {
  await pool.query(await fs.readFile(path.join(ROOT, "server/schema.sql"), "utf8"));
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

module.exports = { createApp, isValidApiToken };

/**
 * Crée un compte de connexion : npm run admin:create -- adresse@exemple.fr
 * Le mot de passe est saisi au terminal, pour ne figurer ni dans l'historique du
 * shell ni dans la liste des processus. bcrypt limite sa longueur à 72 octets.
 */
require("dotenv").config({ path: process.env.APP_ENV_FILE || ".env" });

const readline = require("node:readline");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

/** Lit une saisie au terminal sans l'afficher ; Ctrl+C annule. */
function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("L'outil de création du compte doit être lancé dans un terminal interactif.");
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let value = "";
    const finish = settle => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      settle();
    };
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") return finish(() => reject(new Error("Opération annulée.")));
        if (char === "\r" || char === "\n") return finish(() => resolve(value));
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL doit être défini.");
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Utilisation : npm run admin:create -- adresse@exemple.fr");
  }

  const password = await readHidden("Mot de passe (12 caractères minimum) : ");
  const confirmation = await readHidden("Confirmez le mot de passe : ");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Le mot de passe doit comporter entre 12 et 72 caractères.");
  }
  if (password !== confirmation) throw new Error("Les mots de passe ne correspondent pas.");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO app_users (email, password_hash) VALUES ($1, $2)",
      [email, passwordHash],
    );
    console.log(`Compte administrateur créé pour ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Création du compte impossible :", error.message);
  process.exitCode = 1;
});

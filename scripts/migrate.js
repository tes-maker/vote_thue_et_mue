/**
 * Applique server/schema.sql. Le schéma est idempotent et le serveur l'applique
 * aussi à chaque démarrage ; cette commande sert surtout avant le premier
 * démarrage, pour pouvoir créer le compte administrateur.
 */
require("dotenv").config({ path: process.env.APP_ENV_FILE || ".env" });

const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL doit être défini.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(await fs.readFile(path.join(__dirname, "../server/schema.sql"), "utf8"));
    console.log("Schéma de base de données appliqué.");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Échec de la migration :", error.message);
  process.exitCode = 1;
});

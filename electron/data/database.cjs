const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { runMigrations } = require("./migrations.cjs");
const { seedDatabase } = require("./seed.cjs");

function createDatabase(app) {
  const workspacePath = path.join(app.getPath("userData"), "workspace");
  fs.mkdirSync(workspacePath, { recursive: true });

  const dbPath = path.join(workspacePath, "floris.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);

  runMigrations(db);
  seedDatabase(db);

  return {
    db,
    dbPath,
    workspacePath,
  };
}

module.exports = {
  createDatabase,
};

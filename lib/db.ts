import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Run } from "./types";

export const runtimeDir = path.resolve(/* turbopackIgnore: true */ process.env.INVARIANT_DATA_DIR || ".runtime");
let database: Database.Database | undefined;
export function db() {
  if (!database) {
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    database = new Database(path.join(runtimeDir, "invariant.db"));
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    database.exec("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL)");
  }
  return database;
}
export function saveRun(run: Run) {
  run.updatedAt = new Date().toISOString();
  db().prepare("INSERT INTO runs (id,data,created_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(run.id, JSON.stringify(run), run.createdAt);
  return run;
}
export function getRun(id: string): Run | undefined {
  const row = db().prepare("SELECT data FROM runs WHERE id=?").get(id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) as Run : undefined;
}
export function listRuns(): Run[] {
  return (db().prepare("SELECT data FROM runs ORDER BY created_at DESC LIMIT 100").all() as { data: string }[]).map(row => JSON.parse(row.data) as Run);
}
export function audit(runId: string, action: string, detail: string) {
  db().prepare("INSERT INTO events(run_id,at,action,detail) VALUES(?,?,?,?)").run(runId, new Date().toISOString(), action, detail);
}
export function events(runId: string) { return db().prepare("SELECT at,action,detail FROM events WHERE run_id=? ORDER BY id").all(runId); }

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Client, Message, OpeningInput, OpeningState } from "./types";

const dbPath = process.env.JUNIPER_DB ?? path.join(process.cwd(), "data", "juniper.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS openings (id TEXT PRIMARY KEY, payload TEXT NOT NULL, last_state TEXT);
  CREATE TABLE IF NOT EXISTS messages (offer_id TEXT PRIMARY KEY, opening_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
`);
const seed: Client[] = [
  { id: "maya", name: "Maya Chen", mobile: "+1 (415) 555-0101", service: "Haircut", stylist: "Anyone", availability: "Any time", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-18T10:00:00Z" },
  { id: "olivia", name: "Olivia Brooks", mobile: "+1 (415) 555-0102", service: "Haircut", stylist: "Carla", availability: "Any time", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-20T10:00:00Z" },
  { id: "jules", name: "Jules Rivera", mobile: "+1 (415) 555-0103", service: "Haircut", stylist: "Anyone", availability: "Afternoon", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-22T10:00:00Z" },
  { id: "emma", name: "Emma Wilson", mobile: "+1 (415) 555-0104", service: "Cut & color", stylist: "Lena", availability: "Any time", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-19T10:00:00Z" },
  { id: "nina", name: "Nina Patel", mobile: "+1 (415) 555-0105", service: "Cut & color", stylist: "Anyone", availability: "Any time", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-23T10:00:00Z" },
  { id: "ava", name: "Ava Thompson", mobile: "+1 (415) 555-0106", service: "Blowout", stylist: "Sofia", availability: "Afternoon", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-21T10:00:00Z" },
  { id: "rose", name: "Rose Park", mobile: "+1 (415) 555-0107", service: "Blowout", stylist: "Anyone", availability: "Any time", days: [0,1,2,3,4,5,6], joinedAt: "2026-09-24T10:00:00Z" },
  { id: "zoe", name: "Zoe Martin", mobile: "+1 (415) 555-0108", service: "Haircut", stylist: "Sofia", availability: "Morning", days: [1,2,3,4,5], joinedAt: "2026-09-17T10:00:00Z" },
];
for (const client of seed) db.prepare("INSERT OR IGNORE INTO clients VALUES (?, ?)").run(client.id, JSON.stringify(client));
export function clients(): Client[] {
  return (db.prepare("SELECT payload FROM clients").all() as { payload: string }[])
    .map((row) => JSON.parse(row.payload)).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}
export function openingRows(): { input: OpeningInput; cached?: OpeningState }[] {
  return (db.prepare("SELECT payload, last_state FROM openings ORDER BY rowid DESC").all() as { payload: string; last_state: string | null }[])
    .map((row) => ({ input: JSON.parse(row.payload), cached: row.last_state ? JSON.parse(row.last_state) : undefined }));
}
export function saveOpening(input: OpeningInput) {
  db.prepare("INSERT OR IGNORE INTO openings (id, payload) VALUES (?, ?)").run(input.id, JSON.stringify(input));
}
export function cacheState(state: OpeningState) {
  // Display cache only. Workflow Updates are the authority for changes.
  db.prepare("UPDATE openings SET last_state = ? WHERE id = ?").run(JSON.stringify(state), state.input.id);
}
export function messages(): Message[] {
  return (db.prepare("SELECT payload FROM messages ORDER BY rowid DESC").all() as { payload: string }[]).map((row) => JSON.parse(row.payload));
}
export function messageForToken(token: string): Message | undefined {
  const row = db.prepare("SELECT payload FROM messages WHERE token = ?").get(token) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : undefined;
}

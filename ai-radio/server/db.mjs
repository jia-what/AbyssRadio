/**
 * Database module for Abyss Radio — using sql.js (SQLite compiled to WASM).
 * Stores: play history, liked songs, chat history.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'abyss.db');

let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initTables(db);
  return db;
}

function initTables(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      source TEXT DEFAULT 'netease',
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS liked_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      source TEXT DEFAULT 'netease',
      liked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Don't write at init — wait for first data change
}

let pendingSave = false;
let dirtyCount = 0;

function markDirty() {
  dirtyCount++;
  if (pendingSave) return;
  pendingSave = true;
  // Batch writes: after 50ms idle, or every 10 changes, or every 30s
  setTimeout(() => {
    try {
      if (!db) return;
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('DB save error:', e.message);
    }
    pendingSave = false;
  }, 500);
}

// Also flush every 30 seconds if dirty
setInterval(() => {
  if (dirtyCount > 0 && db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
      dirtyCount = 0;
    } catch (e) {
      console.error('DB periodic save error:', e.message);
    }
  }
}, 30000);

// ===== Play History =====

export async function addPlayHistory(song) {
  const d = await getDb();
  d.run(
    `INSERT INTO play_history (song_id, title, artist, cover, source) VALUES (?, ?, ?, ?, ?)`,
    [song.id, song.title, song.artist || '', song.cover || '', song.source || 'netease']
  );
  markDirty();
}

export async function getPlayHistory(limit = 50) {
  const d = await getDb();
  const stmt = d.prepare(`SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?`);
  stmt.bind([limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ===== Liked Songs =====

export async function toggleLike(song) {
  const d = await getDb();
  // Check if already liked
  const stmt = d.prepare(`SELECT id FROM liked_songs WHERE song_id = ?`);
  stmt.bind([song.id]);
  const exists = stmt.step();
  stmt.free();

  if (exists) {
    d.run(`DELETE FROM liked_songs WHERE song_id = ?`, [song.id]);
    markDirty();
    return { liked: false };
  } else {
    d.run(
      `INSERT OR IGNORE INTO liked_songs (song_id, title, artist, cover, source) VALUES (?, ?, ?, ?, ?)`,
      [song.id, song.title, song.artist || '', song.cover || '', song.source || 'netease']
    );
    markDirty();
    return { liked: true };
  }
}

export async function getLikedSongs() {
  const d = await getDb();
  const stmt = d.prepare(`SELECT * FROM liked_songs ORDER BY liked_at DESC`);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export async function isLiked(songId) {
  const d = await getDb();
  const stmt = d.prepare(`SELECT id FROM liked_songs WHERE song_id = ?`);
  stmt.bind([songId]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// ===== Chat History =====

export async function addChatMessage(role, text) {
  const d = await getDb();
  d.run(`INSERT INTO chat_history (role, text) VALUES (?, ?)`, [role, text]);
  markDirty();
}

export async function getChatHistory(limit = 50) {
  const d = await getDb();
  const stmt = d.prepare(`SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?`);
  stmt.bind([limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.reverse();
}

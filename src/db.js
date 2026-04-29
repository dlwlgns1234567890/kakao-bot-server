const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'bot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    room TEXT,
    first_seen TEXT DEFAULT (datetime('now','localtime')),
    last_seen TEXT DEFAULT (datetime('now','localtime')),
    msg_count INTEGER DEFAULT 0,
    warn_count INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    ban_by TEXT,
    ban_date TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS ban_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    reason TEXT,
    by TEXT,
    date TEXT DEFAULT (datetime('now','localtime')),
    action TEXT DEFAULT 'ban'
  );
  CREATE TABLE IF NOT EXISTS warn_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    reason TEXT,
    by TEXT,
    date TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS msg_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    room TEXT,
    msg TEXT,
    date TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ── 유저 ──────────────────────────────
function upsertUser(nickname, room) {
  const existing = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname);
  if (existing) {
    db.prepare(`UPDATE users SET last_seen=datetime('now','localtime'), msg_count=msg_count+1, room=? WHERE nickname=?`)
      .run(room, nickname);
  } else {
    db.prepare(`INSERT INTO users (nickname, room) VALUES (?,?)`)
      .run(nickname, room);
  }
}

function getUser(nickname) {
  return db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname);
}

function getAllUsers({ search = '', banned = null, page = 1, limit = 20 } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND nickname LIKE ?'; params.push('%' + search + '%'); }
  if (banned !== null) { where += ' AND is_banned = ?'; params.push(banned); }
  const offset = (page - 1) * limit;
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM users ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { rows, total, pages: Math.ceil(total / limit) };
}

function getStats() {
  return {
    totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    bannedUsers: db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned=1').get().c,
    totalMsgs: db.prepare('SELECT COUNT(*) as c FROM msg_logs').get().c,
    todayMsgs: db.prepare("SELECT COUNT(*) as c FROM msg_logs WHERE date >= date('now','localtime')").get().c,
    totalWarns: db.prepare('SELECT COUNT(*) as c FROM warn_logs').get().c,
  };
}

// ── 밴 ──────────────────────────────
function banUser(nickname, reason, by) {
  db.prepare(`UPDATE users SET is_banned=1, ban_reason=?, ban_by=?, ban_date=datetime('now','localtime') WHERE nickname=?`)
    .run(reason, by, nickname);
  db.prepare(`INSERT INTO ban_logs (nickname, reason, by, action) VALUES (?,?,?,'ban')`)
    .run(nickname, reason, by);
}

function unbanUser(nickname, by) {
  db.prepare(`UPDATE users SET is_banned=0, ban_reason=NULL, ban_by=NULL, ban_date=NULL WHERE nickname=?`)
    .run(nickname);
  db.prepare(`INSERT INTO ban_logs (nickname, reason, by, action) VALUES (?,?,'언밴','unban')`)
    .run(nickname, by);
}

function isBanned(nickname) {
  const u = db.prepare('SELECT is_banned FROM users WHERE nickname = ?').get(nickname);
  return u && u.is_banned === 1;
}

function getBannedUsers() {
  return db.prepare('SELECT * FROM users WHERE is_banned=1 ORDER BY ban_date DESC').all();
}

function getBanLogs(nickname) {
  return db.prepare('SELECT * FROM ban_logs WHERE nickname=? ORDER BY date DESC').all(nickname);
}

// ── 경고 ──────────────────────────────
function warnUser(nickname, reason, by) {
  db.prepare(`UPDATE users SET warn_count=warn_count+1 WHERE nickname=?`).run(nickname);
  db.prepare(`INSERT INTO warn_logs (nickname, reason, by) VALUES (?,?,?)`).run(nickname, reason, by);
  return db.prepare('SELECT warn_count FROM users WHERE nickname=?').get(nickname)?.warn_count || 0;
}

function resetWarns(nickname) {
  db.prepare('UPDATE users SET warn_count=0 WHERE nickname=?').run(nickname);
}

function getWarnLogs(nickname) {
  return db.prepare('SELECT * FROM warn_logs WHERE nickname=? ORDER BY date DESC').all(nickname);
}

// ── 메시지 로그 ──────────────────────────────
function logMsg(nickname, room, msg) {
  db.prepare('INSERT INTO msg_logs (nickname, room, msg) VALUES (?,?,?)').run(nickname, room, msg);
}

function getMsgLogs(nickname, limit = 20) {
  return db.prepare('SELECT * FROM msg_logs WHERE nickname=? ORDER BY date DESC LIMIT ?').all(nickname, limit);
}

function getRecentMsgs(limit = 50) {
  return db.prepare('SELECT * FROM msg_logs ORDER BY date DESC LIMIT ?').all(limit);
}

// ── 노트 ──────────────────────────────
function setNote(nickname, note) {
  db.prepare('UPDATE users SET notes=? WHERE nickname=?').run(note, nickname);
}

module.exports = {
  upsertUser, getUser, getAllUsers, getStats,
  banUser, unbanUser, isBanned, getBannedUsers, getBanLogs,
  warnUser, resetWarns, getWarnLogs,
  logMsg, getMsgLogs, getRecentMsgs,
  setNote,
};

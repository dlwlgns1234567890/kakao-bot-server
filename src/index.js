const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'change-this-secret-key';
const ADMIN_PW = process.env.ADMIN_PW || 'admin1234';
const ADMIN_LIST = (process.env.ADMIN_NICKNAMES || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'kakao-bot-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8시간
}));

// ════════════════════════════════════════
// 미들웨어
// ════════════════════════════════════════
function apiAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: '인증 실패' });
  next();
}

function webAuth(req, res, next) {
  if (req.session.admin) return next();
  res.redirect('/login');
}

// ════════════════════════════════════════
// 봇 API (메신저봇R에서 호출)
// ════════════════════════════════════════

// 메시지 수신 & 명령어 처리
app.post('/api/message', apiAuth, (req, res) => {
  const { room, msg, sender } = req.body;
  if (!room || !msg || !sender) return res.json({ reply: null });

  // 유저 기록
  db.upsertUser(sender, room);
  db.logMsg(sender, room, msg);

  // 밴 유저 체크
  if (db.isBanned(sender)) {
    return res.json({ reply: `🚫 ${sender}님은 밴된 유저입니다.` });
  }

  const PREFIX = '!';
  if (!msg.startsWith(PREFIX)) return res.json({ reply: null });

  const args = msg.trim().split(/\s+/);
  const cmd = args[0].slice(PREFIX.length).toLowerCase();
  const isAdmin = ADMIN_LIST.includes(sender);

  // ── 일반 명령어 ──────────────────────────────
  if (cmd === '도움말' || cmd === 'help') {
    let help = `📋 명령어 목록\n━━━━━━━━━━━━\n!도움말 - 명령어 목록\n!내정보 - 내 정보\n!핑 - 봇 상태 확인`;
    if (isAdmin) {
      help += `\n\n🔐 관리자 명령어\n━━━━━━━━━━━━\n!밴 [닉네임] [사유]\n!언밴 [닉네임]\n!경고 [닉네임] [사유]\n!경고초기화 [닉네임]\n!유저정보 [닉네임]\n!밴목록\n!공지 [내용]\n!노트 [닉네임] [내용]`;
    }
    return res.json({ reply: help });
  }

  if (cmd === '핑') {
    return res.json({ reply: '🏓 퐁! 서버 정상 작동 중' });
  }

  if (cmd === '내정보') {
    const u = db.getUser(sender);
    if (!u) return res.json({ reply: '정보 없음' });
    return res.json({ reply: `👤 내 정보\n━━━━━━━━━━━━\n닉네임: ${u.nickname}\n첫 방문: ${u.first_seen}\n마지막: ${u.last_seen}\n메시지: ${u.msg_count}개\n경고: ${u.warn_count}회\n상태: ${u.is_banned ? '🔴 밴됨' : '🟢 정상'}` });
  }

  // ── 관리자 명령어 ──────────────────────────────
  if (!isAdmin) {
    return res.json({ reply: `❌ 관리자 권한이 없습니다.` });
  }

  if (cmd === '밴') {
    const target = args[1];
    const reason = args.slice(2).join(' ') || '사유 없음';
    if (!target) return res.json({ reply: '❌ 사용법: !밴 [닉네임] [사유]' });
    if (ADMIN_LIST.includes(target)) return res.json({ reply: '❌ 관리자는 밴 불가' });
    if (db.isBanned(target)) return res.json({ reply: `⚠️ ${target}님은 이미 밴 상태입니다.` });
    db.upsertUser(target, room);
    db.banUser(target, reason, sender);
    return res.json({ reply: `🔨 밴 완료\n대상: ${target}\n사유: ${reason}\n처리자: ${sender}` });
  }

  if (cmd === '언밴') {
    const target = args[1];
    if (!target) return res.json({ reply: '❌ 사용법: !언밴 [닉네임]' });
    if (!db.isBanned(target)) return res.json({ reply: `⚠️ ${target}님은 밴 상태가 아닙니다.` });
    db.unbanUser(target, sender);
    return res.json({ reply: `✅ ${target}님 밴 해제 완료` });
  }

  if (cmd === '경고') {
    const target = args[1];
    const reason = args.slice(2).join(' ') || '사유 없음';
    if (!target) return res.json({ reply: '❌ 사용법: !경고 [닉네임] [사유]' });
    db.upsertUser(target, room);
    const count = db.warnUser(target, reason, sender);
    let extra = '';
    if (count >= 3) {
      db.banUser(target, `경고 ${count}회 누적`, sender);
      extra = `\n⚠️ 경고 3회 누적 → 자동 밴 처리!`;
    }
    return res.json({ reply: `⚠️ 경고 처리\n대상: ${target}\n사유: ${reason}\n누적: ${count}회${extra}` });
  }

  if (cmd === '경고초기화') {
    const target = args[1];
    if (!target) return res.json({ reply: '❌ 사용법: !경고초기화 [닉네임]' });
    db.resetWarns(target);
    return res.json({ reply: `✅ ${target}님 경고 초기화 완료` });
  }

  if (cmd === '유저정보') {
    const target = args[1];
    if (!target) return res.json({ reply: '❌ 사용법: !유저정보 [닉네임]' });
    const u = db.getUser(target);
    if (!u) return res.json({ reply: `❌ ${target}님의 기록이 없습니다.` });
    return res.json({ reply: `👤 ${u.nickname}\n━━━━━━━━━━━━\n방문: ${u.first_seen}\n메시지: ${u.msg_count}개\n경고: ${u.warn_count}회\n상태: ${u.is_banned ? `🔴 밴 (${u.ban_reason})` : '🟢 정상'}${u.notes ? `\n메모: ${u.notes}` : ''}` });
  }

  if (cmd === '밴목록') {
    const banned = db.getBannedUsers();
    if (!banned.length) return res.json({ reply: '밴된 유저가 없습니다.' });
    const list = banned.slice(0, 15).map((u, i) => `${i+1}. ${u.nickname} - ${u.ban_reason}`).join('\n');
    return res.json({ reply: `🔨 밴 목록 (${banned.length}명)\n━━━━━━━━━━━━\n${list}` });
  }

  if (cmd === '공지') {
    const content = args.slice(1).join(' ');
    if (!content) return res.json({ reply: '❌ 사용법: !공지 [내용]' });
    return res.json({ reply: `📢 공지\n━━━━━━━━━━━━\n${content}\n━━━━━━━━━━━━\nby ${sender}` });
  }

  if (cmd === '노트') {
    const target = args[1];
    const note = args.slice(2).join(' ');
    if (!target || !note) return res.json({ reply: '❌ 사용법: !노트 [닉네임] [내용]' });
    db.setNote(target, note);
    return res.json({ reply: `✅ 노트 저장: ${note}` });
  }

  return res.json({ reply: `❓ 알 수 없는 명령어 — !도움말 을 입력하세요.` });
});

// 입장 이벤트
app.post('/api/join', apiAuth, (req, res) => {
  const { room, sender } = req.body;
  db.upsertUser(sender, room);
  if (db.isBanned(sender)) {
    return res.json({ reply: `🚫 ${sender}님은 밴된 유저입니다. 입장이 거부되었습니다.` });
  }
  return res.json({ reply: `👋 ${sender}님, 환영합니다!\n!도움말 을 입력하면 명령어를 볼 수 있어요.` });
});

// ════════════════════════════════════════
// 웹 관리자 페이지 라우트
// ════════════════════════════════════════
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));

app.post('/login', (req, res) => {
  if (req.body.password === ADMIN_PW) {
    req.session.admin = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/', webAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ── 웹 API (관리 페이지용) ──────────────────────────────
app.get('/web/stats', webAuth, (req, res) => res.json(db.getStats()));

app.get('/web/users', webAuth, (req, res) => {
  const { search, banned, page } = req.query;
  res.json(db.getAllUsers({
    search: search || '',
    banned: banned === 'true' ? 1 : banned === 'false' ? 0 : null,
    page: parseInt(page) || 1,
    limit: 20,
  }));
});

app.get('/web/user/:nickname', webAuth, (req, res) => {
  const u = db.getUser(req.params.nickname);
  if (!u) return res.status(404).json({ error: '없음' });
  const warns = db.getWarnLogs(req.params.nickname);
  const bans = db.getBanLogs(req.params.nickname);
  const msgs = db.getMsgLogs(req.params.nickname, 20);
  res.json({ user: u, warns, bans, msgs });
});

app.post('/web/ban', webAuth, (req, res) => {
  const { nickname, reason } = req.body;
  db.upsertUser(nickname, '관리자페이지');
  db.banUser(nickname, reason || '관리자 처리', '관리자');
  res.json({ ok: true });
});

app.post('/web/unban', webAuth, (req, res) => {
  db.unbanUser(req.body.nickname, '관리자');
  res.json({ ok: true });
});

app.post('/web/warn', webAuth, (req, res) => {
  db.upsertUser(req.body.nickname, '관리자페이지');
  const count = db.warnUser(req.body.nickname, req.body.reason || '관리자 경고', '관리자');
  if (count >= 3) db.banUser(req.body.nickname, `경고 ${count}회 누적`, '관리자');
  res.json({ ok: true, count });
});

app.post('/web/note', webAuth, (req, res) => {
  db.setNote(req.body.nickname, req.body.note);
  res.json({ ok: true });
});

app.get('/web/msgs', webAuth, (req, res) => {
  res.json(db.getRecentMsgs(100));
});

app.listen(PORT, () => console.log(`✅ 봇 서버 실행 중: http://localhost:${PORT}`));

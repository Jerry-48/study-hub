/**
 * ICT Notes backend (Google Apps Script) - bind this to your Google Sheet.
 * Before first use: Project Settings > Script properties, add:
 *   OWNER_EMAIL, OWNER_PASSWORD (long & private), FOLDER_ID (Drive folder for uploads)
 * Then run setup() once, and Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 */
const PW_MINUTES = 20, SESSION_HOURS = 2, MAX_MB = 10, DAILY_MAILS = 90;
const SHEETS = {
  Users:    ['email', 'name', 'hash', 'salt', 'expires', 'lastRequest', 'attempts'],
  Sessions: ['token', 'email', 'name', 'role', 'expires'],
  Roles:    ['email', 'role', 'addedAt'],
  Notes:    ['id', 'title', 'subject', 'fileId', 'url', 'email', 'name', 'status', 'createdAt']
};
const P = PropertiesService.getScriptProperties();

function setup() { Object.keys(SHEETS).forEach(sheet); }
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(SHEETS[name]); s.setFrozenRows(1); }
  return s;
}
function table(name) {
  const s = sheet(name), v = s.getDataRange().getValues(), h = v.shift();
  return { s, h, rows: v.map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; }) };
}
function put(t, row, key, val) { t.s.getRange(row, t.h.indexOf(key) + 1).setValue(val); }
function add(name, obj) { sheet(name).appendRow(SHEETS[name].map(k => obj[k] === undefined ? '' : obj[k])); }

const norm = e => String(e || '').trim().toLowerCase();
const hash = (pw, salt) => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw));
function rand(n, chars) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random());
  let out = ''; for (let i = 0; i < n; i++) out += chars[(d[i] & 255) % chars.length]; return out;
}
const same = (a, b) => { a = String(a); b = String(b); let x = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) x |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return x === 0; };
const fail = msg => { throw new Error(msg); };

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { // public list of approved notes
  const notes = table('Notes').rows.filter(n => n.status === 'approved')
    .map(n => ({ title: n.title, subject: n.subject, url: n.url, by: n.name }));
  return out({ ok: true, notes });
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const b = JSON.parse(e.postData.contents);
    const fn = ACTIONS[b.action] || fail('Unknown action');
    return out({ ok: true, data: fn(b) });
  } catch (err) { return out({ ok: false, error: err.message }); }
  finally { lock.releaseLock(); }
}

/* ---------- login ---------- */
function requestPassword(b) {
  const email = norm(b.email), name = String(b.name || '').trim().slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  if (name.length < 2) fail('Enter your name.');
  const cache = CacheService.getScriptCache(), day = 'mail_' + new Date().toISOString().slice(0, 10);
  const sent = Number(cache.get(day) || 0);
  if (sent >= DAILY_MAILS) fail('Daily email limit reached. Try again tomorrow.');
  const t = table('Users'), u = t.rows.find(r => r.email === email);
  if (u && Date.now() - Number(u.lastRequest) < 60000) fail('Wait a minute before asking for another password.');
  const pw = rand(8, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'), salt = rand(12, '0123456789abcdef');
  const vals = { name, hash: hash(pw, salt), salt, expires: Date.now() + PW_MINUTES * 60000, lastRequest: Date.now(), attempts: 0 };
  if (u) Object.keys(vals).forEach(k => put(t, u._row, k, vals[k])); else add('Users', Object.assign({ email }, vals));
  MailApp.sendEmail(email, 'Your ICT Notes password',
    'Hi ' + name + ',\n\nYour temporary password: ' + pw + '\n\nIt works for ' + PW_MINUTES + ' minutes. If you did not ask for it, ignore this email.');
  cache.put(day, String(sent + 1), 86400);
  return { minutes: PW_MINUTES };
}

function roleOf(email) {
  if (email === norm(P.getProperty('OWNER_EMAIL'))) return 'owner';
  const r = table('Roles').rows.find(x => x.email === email);
  return r ? r.role : 'user';
}
function startSession(email, name, role) {
  const token = rand(40, 'abcdefghijklmnopqrstuvwxyz0123456789');
  add('Sessions', { token, email, name, role, expires: Date.now() + SESSION_HOURS * 3600000 });
  return { token, name, email, role: roleOf(email) };
}
function login(b) {
  const email = norm(b.email), t = table('Users'), u = t.rows.find(r => r.email === email);
  if (!u || Date.now() > Number(u.expires)) fail('Password expired or not found. Ask for a new one.');
  if (Number(u.attempts) >= 5) fail('Too many wrong tries. Ask for a new password.');
  if (!same(hash(String(b.password || '').trim(), u.salt), u.hash)) {
    put(t, u._row, 'attempts', Number(u.attempts) + 1); fail('Wrong password.');
  }
  put(t, u._row, 'expires', 0); // one-time use
  return startSession(email, u.name, roleOf(email));
}
function ownerLogin(b) {
  const email = norm(b.email), cache = CacheService.getScriptCache(), k = 'own_fail';
  if (Number(cache.get(k) || 0) >= 5) fail('Locked for 15 minutes after too many tries.');
  const ok = email === norm(P.getProperty('OWNER_EMAIL')) && same(b.password || '', P.getProperty('OWNER_PASSWORD') || '\u0000');
  if (!ok) { cache.put(k, String(Number(cache.get(k) || 0) + 1), 900); fail('Wrong email or password.'); }
  return startSession(email, 'Owner', 'owner');
}
function auth(b, allowed) {
  const s = table('Sessions').rows.find(r => r.token === b.token && Date.now() < Number(r.expires));
  if (!s) fail('Session expired. Please log in again.');
  const role = roleOf(s.email);
  if (allowed && allowed.indexOf(role) < 0) fail('You are not allowed to do this.');
  return { email: s.email, name: s.name, role };
}

/* ---------- notes ---------- */
const STAFF = ['worker', 'admin', 'owner'], REVIEW = ['admin', 'owner'];
function share(id, on) {
  const f = DriveApp.getFileById(id);
  f.setSharing(on ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
}
function upload(b) {
  const me = auth(b), title = String(b.title || '').trim().slice(0, 80), subject = String(b.subject || '').slice(0, 60);
  if (title.length < 3) fail('Give the note a title.');
  const bytes = Utilities.base64Decode(b.data || '');
  if (bytes.length > MAX_MB * 1048576) fail('File is bigger than ' + MAX_MB + ' MB.');
  if (!(bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)) fail('Only PDF files are allowed.');
  const file = DriveApp.getFolderById(P.getProperty('FOLDER_ID')).createFile(Utilities.newBlob(bytes, 'application/pdf', title + '.pdf'));
  const status = STAFF.indexOf(me.role) >= 0 ? 'approved' : 'pending';
  if (status === 'approved') share(file.getId(), true);
  add('Notes', { id: rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789'), title, subject, fileId: file.getId(), url: file.getUrl(), email: me.email, name: me.name, status, createdAt: new Date().toISOString() });
  return { status };
}
function listNotes(b) {
  const me = auth(b), rows = table('Notes').rows.filter(n => n.status !== 'deleted' && n.status !== 'rejected');
  const pick = n => ({ id: n.id, title: n.title, subject: n.subject, url: n.url, by: n.name, email: n.email, status: n.status });
  if (REVIEW.indexOf(me.role) >= 0) return rows.map(pick);
  if (me.role === 'worker') return rows.filter(n => n.status === 'approved' || n.email === me.email).map(pick);
  return rows.filter(n => n.email === me.email).map(pick);
}
function findNote(id) { const t = table('Notes'); return { t, n: t.rows.find(r => r.id === id) || fail('Note not found.') }; }
function review(b) {
  auth(b, REVIEW); const { t, n } = findNote(b.id), yes = b.decision === 'approve';
  if (n.status !== 'pending') fail('Already reviewed.');
  if (yes) share(n.fileId, true); else DriveApp.getFileById(n.fileId).setTrashed(true);
  put(t, n._row, 'status', yes ? 'approved' : 'rejected');
  MailApp.sendEmail(n.email, yes ? 'Your note is live' : 'Your note was not accepted',
    yes ? '"' + n.title + '" is now on the ICT notes site. Thank you!' : '"' + n.title + '" was not accepted. You can upload a corrected version.');
  return {};
}
function removeNote(b) {
  auth(b, STAFF); const { t, n } = findNote(b.id);
  DriveApp.getFileById(n.fileId).setTrashed(true); put(t, n._row, 'status', 'deleted'); return {};
}

/* ---------- team (owner only) ---------- */
function listTeam(b) { auth(b, ['owner']); return table('Roles').rows.map(r => ({ email: r.email, role: r.role })); }
function setRole(b) {
  auth(b, ['owner']); const email = norm(b.email), role = b.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  if (['admin', 'worker', 'none'].indexOf(role) < 0) fail('Pick admin or worker.');
  const t = table('Roles'), r = t.rows.find(x => x.email === email);
  if (role === 'none') { if (r) t.s.deleteRow(r._row); }
  else if (r) put(t, r._row, 'role', role); else add('Roles', { email, role, addedAt: new Date().toISOString() });
  return {};
}

const ACTIONS = { requestPassword, login, ownerLogin, upload, listNotes, review, removeNote, listTeam, setRole };

/**
 * Пульт AI-штаба — серверная часть. ОТДЕЛЬНЫЙ проект Apps Script (не внутри таблицы), открывает таблицу по ID.
 * Пароль хранится в «Свойствах скрипта»: PULT_PASSWORD. В коде пароля нет.
 * Данные пульта (задачи, счета) — лист PULT_SHEET. Остальные листы — только чтение.
 */
const SHEET_ID = '1NIoFb1pGeF25zf1jMWZORc8lFXv5ALdJbn2MdrBGHQA'; // Uchet_UA_AI_SHTAB_FINAL
const PULT_SHEET = '20_Пульт_база';
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
const READ_SHEETS = ['Доставки', '3. Продажи', '5. Опексы', '6. Возвраты', '7. Остатки', '2. SKU'];
const COLLECTIONS = ['items', 'cash'];
const MAX_FAILS = 5, LOCK_MIN = 60;
const INBOX = 'Пульт — входящие от Claude'; // папка в Google Drive: Claude кладёт сюда изменения задач
const SEED = null; // заполняется только в копии для первого запуска

function doGet() { return out_({ ok: true, app: 'pult' }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (_) { return out_({ ok: false, code: 'bad_request' }); }
  const auth = checkPw_(req.pw);
  if (auth) return out_({ ok: false, code: auth });
  try {
    switch (req.op) {
      case 'ping': return out_({ ok: true });
      case 'read': return out_({ ok: true, data: readMany_(req.ranges || []) });
      case 'list': applyInbox_(); return out_({ ok: true, docs: list_(req.collection) });
      case 'set': write_(req.collection, req.id, req.data, false); return out_({ ok: true });
      case 'update': write_(req.collection, req.id, req.data, true); return out_({ ok: true });
      case 'delete': del_(req.collection, req.id); return out_({ ok: true });
      default: return out_({ ok: false, code: 'bad_op' });
    }
  } catch (err) { return out_({ ok: false, code: 'tool_error', message: String(err && err.message || err) }); }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checkPw_(pw) {
  const props = PropertiesService.getScriptProperties();
  const real = props.getProperty('PULT_PASSWORD');
  if (!real) return 'no_password_set';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const until = Number(props.getProperty('LOCK_UNTIL') || 0);
    if (Date.now() < until) return 'locked';
    if (typeof pw === 'string' && pw === real) { props.setProperty('FAILS', '0'); return null; }
    const fails = Number(props.getProperty('FAILS') || 0) + 1;
    if (fails >= MAX_FAILS) { props.setProperty('LOCK_UNTIL', String(Date.now() + LOCK_MIN * 60000)); props.setProperty('FAILS', '0'); return 'locked'; }
    props.setProperty('FAILS', String(fails));
    return 'bad_password';
  } finally { lock.releaseLock(); }
}

// ---------- чтение таблицы (формат как у коннектора: числа — числами, даты — как в таблице)
function readMany_(ranges) {
  const ss = ss_(), res = {};
  ranges.slice(0, 20).forEach(a1 => {
    const m = /^'?(.+?)'?!([A-Z]+\d+:[A-Z]+\d+)$/.exec(String(a1));
    if (!m || READ_SHEETS.indexOf(m[1]) < 0) { res[a1] = { ok: false, code: 'not_allowed' }; return; }
    const sh = ss.getSheetByName(m[1]);
    if (!sh) { res[a1] = { ok: false, code: 'no_sheet' }; return; }
    const rg = sh.getRange(m[2]), v = rg.getValues(), d = rg.getDisplayValues();
    const rows = v.map((r, i) => {
      const row = r.map((x, j) => x instanceof Date ? d[i][j] : x);
      while (row.length && row[row.length - 1] === '') row.pop();
      return row;
    });
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    res[a1] = { ok: true, values: rows };
  });
  return res;
}

// ---------- база пульта: лист PULT_SHEET, столбцы: collection | id | json | updatedAt
function base_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PULT_SHEET);
  if (!sh) { sh = ss.insertSheet(PULT_SHEET, ss.getNumSheets()); sh.getRange(1, 1, 1, 4).setValues([['collection', 'id', 'json', 'updatedAt']]); sh.setFrozenRows(1); }
  if (!sh.isSheetHidden()) sh.hideSheet();
  return sh;
}
function rows_(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, 4).getValues(); }
function okCol_(c) { if (COLLECTIONS.indexOf(c) < 0) throw new Error('collection not allowed'); }
function list_(c) {
  okCol_(c);
  return rows_(base_()).filter(r => r[0] === c && r[1]).map(r => { let d = {}; try { d = JSON.parse(r[2]); } catch (_) {} return { id: String(r[1]), data: d }; });
}
function write_(c, id, data, merge) {
  okCol_(c); if (!id) throw new Error('no id');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = base_(), rs = rows_(sh), i = rs.findIndex(r => r[0] === c && String(r[1]) === String(id));
    let d = data || {};
    if (merge && i >= 0) { let old = {}; try { old = JSON.parse(rs[i][2]); } catch (_) {} d = Object.assign(old, d); }
    const row = [c, String(id), JSON.stringify(d), new Date().toISOString()];
    if (i >= 0) sh.getRange(i + 2, 1, 1, 4).setValues([row]); else sh.appendRow(row);
  } finally { lock.releaseLock(); }
}
function del_(c, id) {
  okCol_(c);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const sh = base_(), rs = rows_(sh), i = rs.findIndex(r => r[0] === c && String(r[1]) === String(id)); if (i >= 0) sh.deleteRow(i + 2); }
  finally { lock.releaseLock(); }
}

// ---------- входящие от Claude: файлы .json в папке INBOX вида {"ops":[{"op":"set|update|delete","collection":"items","id":"...","data":{...}}]}
function inboxFolder_() { const it = DriveApp.getFoldersByName(INBOX); return it.hasNext() ? it.next() : DriveApp.createFolder(INBOX); }
function applyInbox_() {
  const it = DriveApp.getFoldersByName(INBOX); if (!it.hasNext()) return 0;
  const folder = it.next(), files = [], fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort((a, b) => a.getDateCreated() - b.getDateCreated());
  let n = 0;
  files.filter(f => f.getName().indexOf('ОШИБКА') !== 0).forEach(f => {
    try {
      const j = JSON.parse(f.getBlob().getDataAsString());
      (j.ops || []).forEach(o => { if (o.op === 'delete') del_(o.collection, o.id); else write_(o.collection, o.id, o.data, o.op === 'update'); n++; });
      try { f.setTrashed(true); } catch (_) { folder.removeFile(f); }
    } catch (err) { f.setName('ОШИБКА — ' + f.getName()); }
  });
  return n;
}
function inboxTick() { applyInbox_(); }

/** Запустить один раз вручную: создаёт лист базы и переносит задачи и счета из пульта в Claude. */
function setup() {
  base_(); inboxFolder_();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'inboxTick')) ScriptApp.newTrigger('inboxTick').timeBased().everyMinutes(10).create();
  if (!SEED) { Logger.log('Лист готов. Данных для переноса нет.'); return; }
  let n = 0;
  Object.keys(SEED).forEach(c => SEED[c].forEach(doc => { write_(c, doc.id, doc.data, false); n++; }));
  Logger.log('Готово. Перенесено записей: ' + n);
}

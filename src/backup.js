// 자동 백업: 하루 한 번 설정·할 일·메모·대화를 백업 폴더에 저장하고, 원하면 되돌린다.
//  - 기본 위치: %APPDATA%\Yusk Widget\backups (최근 30개 보관)
//  - 추가 위치(선택): OneDrive 같은 폴더를 고르면 비밀값(암호화된 키·토큰)을 뺀 사본도 저장
const { app, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const KEEP = 30;
const dir = () => path.join(app.getPath('userData'), 'backups');
const chatFile = () => path.join(app.getPath('userData'), 'chat-history.json');
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

function readChat() {
  try { return JSON.parse(fs.readFileSync(chatFile(), 'utf8')); } catch { return []; }
}

function snapshot({ withSecrets }) {
  const data = structuredClone(store.get());
  if (!withSecrets) {
    delete data.secrets;
    if (data.weather) delete data.weather.keyEnc;
    if (data.ai) delete data.ai.apiKeyEnc;
  }
  return { app: 'Yusk Widget', version: 1, createdAt: new Date().toISOString(), withSecrets, config: data, chat: readChat() };
}

function list() {
  try {
    return fs.readdirSync(dir())
      .filter((f) => /^backup-.*\.json$/.test(f))
      .map((f) => ({ file: f, path: path.join(dir(), f), time: fs.statSync(path.join(dir(), f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
  } catch {
    return [];
  }
}

function prune() {
  for (const b of list().slice(KEEP)) {
    try { fs.unlinkSync(b.path); } catch { /* 무시 */ }
  }
}

function write(label = '') {
  fs.mkdirSync(dir(), { recursive: true });
  const name = `backup-${stamp()}${label ? `-${label}` : ''}.json`;
  fs.writeFileSync(path.join(dir(), name), JSON.stringify(snapshot({ withSecrets: true }), null, 2), 'utf8');
  const extra = store.get().backup?.extraDir;
  if (extra) {
    try {
      fs.mkdirSync(extra, { recursive: true });
      // 외부 폴더에는 비밀값을 빼고, 하루 한 파일로 덮어쓴다
      fs.writeFileSync(path.join(extra, `yusk-widget-${stamp().slice(0, 10)}.json`), JSON.stringify(snapshot({ withSecrets: false }), null, 2), 'utf8');
    } catch { /* 외부 폴더 실패는 기본 백업을 막지 않는다 */ }
  }
  store.update({ backup: { last: new Date().toISOString() } });
  prune();
  return name;
}

// 오늘 백업이 없으면 만든다
function daily() {
  const last = store.get().backup?.last;
  const today = new Date().toDateString();
  if (!last || new Date(last).toDateString() !== today) {
    try { write(); } catch { /* 다음에 다시 */ }
  }
}

function status() {
  const b = list();
  return { last: store.get().backup?.last || null, count: b.length, dir: dir(), extraDir: store.get().backup?.extraDir || '' };
}

async function restore(win, reloadAll) {
  const r = await dialog.showOpenDialog(win, {
    title: '되돌릴 백업 선택', defaultPath: dir(), properties: ['openFile'], filters: [{ name: '백업', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, ''));
    if (data.app !== 'Yusk Widget' || !data.config) throw new Error();
  } catch {
    return { ok: false, error: 'Yusk Widget 백업 파일이 아니에요.' };
  }
  const when = new Date(data.createdAt).toLocaleString('ko-KR');
  const c = data.config;
  const ask = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['되돌리기', '취소'], defaultId: 1, cancelId: 1, title: '백업에서 되돌리기',
    message: `${when} 백업으로 되돌릴까요?`,
    detail: `할 일 ${c.todos?.length || 0}개 · 메모 ${c.memos?.length || 0}개 · 대화 ${data.chat?.length || 0}개\n지금 상태는 먼저 따로 백업해 둬요.`,
  });
  if (ask.response !== 0) return { ok: false, canceled: true };
  applyBackup(data);
  reloadAll();
  return { ok: true };
}

// 백업 내용을 실제로 적용 (적용 전 지금 상태를 따로 백업)
function applyBackup(data) {
  write('before-restore');
  // 비밀값이 없는 백업(외부 폴더용)이면 지금 저장된 키·토큰은 그대로 둔다
  const current = store.get();
  const next = { ...data.config };
  if (!data.withSecrets) {
    next.secrets = current.secrets;
    next.weather = { ...next.weather, keyEnc: current.weather?.keyEnc ?? null };
  }
  store.replace(next);
  try { fs.writeFileSync(chatFile(), JSON.stringify(data.chat || []), 'utf8'); } catch { /* 대화는 없어도 됨 */ }
}

function register(getWin, reloadAll) {
  daily();
  setInterval(daily, 3 * 3600e3);
  ipcMain.handle('backup:status', () => status());
  ipcMain.handle('backup:now', () => { write(); return status(); });
  ipcMain.handle('backup:open', () => { fs.mkdirSync(dir(), { recursive: true }); shell.openPath(dir()); });
  ipcMain.handle('backup:restore', () => restore(getWin(), reloadAll));
  ipcMain.handle('backup:choose-extra', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: '추가 백업 폴더 선택 (예: OneDrive)', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return status();
    store.update({ backup: { extraDir: r.filePaths[0] } });
    write();
    return status();
  });
  ipcMain.handle('backup:clear-extra', () => { store.update({ backup: { extraDir: '' } }); return status(); });
}

module.exports = { register, _internal: { snapshot, write, list, applyBackup, daily } };

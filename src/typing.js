// 타자 연습 (몽키타입 스타일) — 개인판 전용. 넓은 창 하나를 띄우고, 기록·최고 기록은 설정 파일에 저장한다.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const store = require('./store');

const HISTORY_MAX = 300;
let win = null;
let deps = { getWidget: () => null, icon: undefined };

const typing = () => store.get().typing || {};

// 최고 기록 구분: 모드·길이·언어·문장부호·숫자가 같아야 같은 종목
const pbKey = (r) => `${r.mode}-${r.amount}-${r.lang}${r.punctuation ? '-p' : ''}${r.numbers ? '-n' : ''}`;

function notifyWidget() {
  const w = deps.getWidget();
  if (w && !w.isDestroyed()) w.webContents.send('typing-changed', typing());
}

function open() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(1000, wa.width - 80), height = Math.min(560, wa.height - 80);
  win = new BrowserWindow({
    x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height,
    minWidth: 640, minHeight: 400, frame: false, backgroundColor: '#323437', resizable: true,
    title: '뭉치위젯 타자 연습', icon: deps.icon, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'typing.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });
}

function register(d) {
  deps = { ...deps, ...d };
  ipcMain.handle('typing:open', () => open());
  ipcMain.handle('typing:get', () => typing());
  // 모드 설정만 바꾼다 (기록·최고 기록은 typing:result 로만)
  ipcMain.handle('typing:settings', (_e, patch) => {
    const allow = ['mode', 'time', 'words', 'lang', 'punctuation', 'numbers', 'theme'];
    const p = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allow.includes(k)));
    store.update({ typing: p });
    return typing();
  });
  // 한 판 끝: 기록 추가, 최고 기록이면 갱신
  ipcMain.handle('typing:result', (_e, r) => {
    if (!r || !Number.isFinite(r.wpm) || r.wpm < 0 || r.wpm > 400) return { ok: false };
    const t = typing();
    const key = pbKey(r);
    const prev = (t.pb || {})[key] || null;
    const isPb = !prev || r.wpm > prev.wpm;
    const entry = { ...r, at: Date.now() };
    const history = [...(t.history || []), entry].slice(-HISTORY_MAX);
    const pb = isPb ? { ...(t.pb || {}), [key]: { wpm: r.wpm, acc: r.acc, raw: r.raw, at: entry.at } } : (t.pb || {});
    store.update({ typing: { history, pb } });
    notifyWidget();
    return { ok: true, isPb, prev };
  });
}

module.exports = { register, open };

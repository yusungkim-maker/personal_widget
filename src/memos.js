// 메모: 목록은 설정 파일에 저장하고, 메모마다 작은 팝업 창(포스트잇)으로 편집한다.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const store = require('./store');

const COLORS = ['yellow', 'mint', 'sky', 'pink', 'lavender'];
const POPUP = { width: 300, height: 340 };
const windows = new Map(); // memo id → BrowserWindow

let getWidget = () => null;

const memos = () => store.get().memos;
const find = (id) => memos().find((m) => m.id === id);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isEmpty = (m) => !m || (!String(m.title || '').trim() && !String(m.body || '').trim());

function broadcast() {
  const list = memos();
  for (const w of [getWidget(), ...windows.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('memos-changed', list);
  }
}

function save(list) {
  store.update({ memos: list });
  broadcast();
}

// 위젯 옆 (왼쪽 우선) 에 띄우고, 여러 개면 조금씩 비껴서 쌓는다
function popupPosition() {
  const widget = getWidget();
  const n = windows.size;
  if (!widget || widget.isDestroyed()) {
    const wa = screen.getPrimaryDisplay().workArea;
    return { x: wa.x + wa.width - POPUP.width - 400 - n * 24, y: wa.y + 80 + n * 24 };
  }
  const b = widget.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const left = b.x - POPUP.width - 12;
  const x = left >= wa.x ? left - n * 24 : Math.min(b.x + b.width + 12 + n * 24, wa.x + wa.width - POPUP.width);
  const y = Math.min(b.y + 60 + n * 28, wa.y + wa.height - POPUP.height - 10);
  return { x, y };
}

function open(id) {
  const existing = windows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  if (!find(id)) return;
  const { x, y } = popupPosition();
  const w = new BrowserWindow({
    x, y, ...POPUP,
    minWidth: 240, minHeight: 220,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: '메모',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.setAlwaysOnTop(true, 'floating');
  w.loadFile(path.join(__dirname, 'renderer', 'memo.html'), { query: { id } });
  w.once('ready-to-show', () => w.show());
  windows.set(id, w);
  w.on('closed', () => {
    windows.delete(id);
    // 아무것도 안 쓰고 닫은 메모는 지운다
    if (isEmpty(find(id))) save(memos().filter((m) => m.id !== id));
  });
}

function create(initial = {}) {
  const now = Date.now();
  const memo = {
    id: newId(),
    title: String(initial.title || '').slice(0, 200),
    body: String(initial.body || '').slice(0, 20000),
    color: COLORS.includes(initial.color) ? initial.color : COLORS[memos().length % COLORS.length],
    createdAt: now,
    updatedAt: now,
  };
  save([memo, ...memos()]);
  return memo;
}

function update(id, patch) {
  const allowed = {};
  if (typeof patch.title === 'string') allowed.title = patch.title.slice(0, 200);
  if (typeof patch.body === 'string') allowed.body = patch.body.slice(0, 20000);
  if (COLORS.includes(patch.color)) allowed.color = patch.color;
  if (typeof patch.pinned === 'boolean') allowed.pinned = patch.pinned;
  let changed = null;
  const list = memos().map((m) => {
    if (m.id !== id) return m;
    changed = { ...m, ...allowed, updatedAt: Date.now() };
    return changed;
  });
  if (changed) save(list);
  return changed;
}

function remove(id) {
  const w = windows.get(id);
  save(memos().filter((m) => m.id !== id));
  if (w && !w.isDestroyed()) w.close();
  return true;
}

function register(widgetGetter) {
  getWidget = widgetGetter;
  ipcMain.handle('memo:get', (_e, id) => find(id) || null);
  ipcMain.handle('memo:open', (_e, id) => open(id));
  ipcMain.handle('memo:create', (_e, initial, openAfter = true) => {
    const m = create(initial || {});
    if (openAfter) open(m.id);
    return m;
  });
  ipcMain.handle('memo:update', (_e, id, patch) => update(id, patch || {}));
  ipcMain.handle('memo:delete', (_e, id) => remove(id));
  ipcMain.handle('memo:close-self', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}

module.exports = { register, COLORS };

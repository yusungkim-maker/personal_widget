// 어디서나 빠른 입력: 전역 단축키로 화면 가운데에 입력창을 띄운다.
const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const store = require('./store');

// Ctrl+Alt+Space 는 다른 앱(예: Claude 데스크톱 빠른 입력)과 겹치는 경우가 많아 Ctrl+Alt+M 을 기본으로 한다.
// Alt+Shift+… 는 Windows 입력 언어 전환과, Ctrl+Shift+Space 는 Word 의 줄 바꿈 없는 공백과 겹친다.
const HOTKEYS = ['Control+Alt+M', 'Control+Alt+Q', 'Control+Alt+Space', 'Alt+Shift+Space'];
let quickWin = null;
let registered = null;
let lastError = '';
let getWidget = () => null;

function createQuickWindow() {
  quickWin = new BrowserWindow({
    width: 560, height: 170,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    show: false, title: '빠른 입력',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  quickWin.setAlwaysOnTop(true, 'pop-up-menu');
  quickWin.loadFile(path.join(__dirname, 'renderer', 'quick.html'));
  quickWin.on('blur', () => quickWin?.hide());
  quickWin.on('closed', () => { quickWin = null; });
}

// 사용자가 단축키를 눌렀을 때만 뜨므로 포커스를 가져간다
function showQuick() {
  if (!quickWin || quickWin.isDestroyed()) createQuickWindow();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const [w] = quickWin.getSize();
  quickWin.setPosition(Math.round(d.x + (d.width - w) / 2), Math.round(d.y + d.height * 0.22));
  const reveal = () => {
    quickWin.show();
    quickWin.focus();
    quickWin.webContents.send('quick:open');
  };
  if (quickWin.webContents.isLoading()) quickWin.webContents.once('did-finish-load', reveal);
  else reveal();
}

function applyHotkey() {
  if (registered) globalShortcut.unregister(registered);
  registered = null;
  lastError = '';
  const q = store.get().quick || {};
  const key = q.hotkey ?? HOTKEYS[0];
  if (!key) return;
  const tryKey = (k) => { try { return globalShortcut.register(k, showQuick); } catch { return false; } };
  if (tryKey(key)) { registered = key; return; }
  if (!q.userSet) {
    // 직접 고른 단축키가 아니면, 비어 있는 다른 조합으로 자동으로 바꾼다
    const free = HOTKEYS.find((k) => k !== key && tryKey(k));
    if (free) { registered = free; store.update({ quick: { hotkey: free } }); return; }
  }
  lastError = '다른 프로그램이 이미 이 단축키를 쓰고 있어요. 다른 조합을 골라 주세요.';
}

function register(widgetGetter) {
  getWidget = widgetGetter;
  applyHotkey();
  ipcMain.handle('quick:status', () => ({ hotkey: registered, error: lastError, options: HOTKEYS }));
  ipcMain.handle('quick:set-hotkey', (_e, key) => {
    store.update({ quick: { hotkey: key || '', userSet: true } });
    applyHotkey();
    return { hotkey: registered, error: lastError, options: HOTKEYS };
  });
  ipcMain.handle('quick:hide', () => quickWin?.hide());
  // 위젯으로 넘기는 작업 (할 일 추가, 뭉치에게 질문, 일정 입력 화면 열기, 달력 새로고침)
  ipcMain.handle('quick:to-widget', (_e, kind, payload) => {
    const w = getWidget();
    if (!w || w.isDestroyed()) return false;
    if (kind === 'ask' || kind === 'compose') { w.show(); w.focus(); }
    w.webContents.send('quick:action', kind, payload);
    return true;
  });
}

const unregisterAll = () => globalShortcut.unregisterAll();

module.exports = { register, showQuick, unregisterAll, hotkeyLabel: () => registered };

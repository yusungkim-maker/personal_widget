const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const store = require('./store');
const win32 = require('./win32');
const calendar = require('./calendar');
const llm = require('./llm');
const gcal = require('./gcal');
const memos = require('./memos');
const quick = require('./quick');
const weather = require('./weather');

const BASE_WIDTH = 340;
const APP_NAME = 'YuskWidget';

let win = null;
let nationWin = null;
let tray = null;
let bottomTimer = null;
let contentHeight = 600;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => win?.show());
}

const APP_ID = 'com.yusk.widget';
app.setAppUserModelId(APP_ID);

// Windows 는 시작 메뉴 바로 가기에 같은 AppUserModelID 가 등록된 앱의 알림만 보여 준다.
// 설치판은 설치 프로그램이 만들어 주고, 개발 실행일 때는 여기서 만든다.
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32' || app.isPackaged) return;
  const { shell } = require('electron');
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Yusk Widget.lnk');
  const want = { target: process.execPath, args: `"${path.resolve(app.getAppPath())}"`, appUserModelId: APP_ID, description: 'Yusk Widget' };
  try {
    const cur = shell.readShortcutLink(lnk);
    if (cur.target === want.target && cur.args === want.args && cur.appUserModelId === APP_ID) return;
  } catch { /* 없음 */ }
  // 'replace' 는 이미 있는 파일에만 쓸 수 있다
  try { shell.writeShortcutLink(lnk, require('fs').existsSync(lnk) ? 'replace' : 'create', want); } catch { /* 알림만 안 뜰 뿐 */ }
}

// ───────────────────────── 창 ─────────────────────────

function cfg() {
  return store.get();
}

function defaultPosition(width) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - width - 24, y: wa.y + 24 };
}

// 저장된 위치가 현재 연결된 모니터 밖이면 기본 위치로 되돌린다.
function validPosition(x, y, width) {
  if (x == null || y == null) return defaultPosition(width);
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    x + 40 > a.x && x < a.x + a.width - 40 && y >= a.y - 10 && y < a.y + a.height - 40);
  return onScreen ? { x, y } : defaultPosition(width);
}

function widthPx() {
  return Math.round(BASE_WIDTH * cfg().window.zoom);
}

function createWindow() {
  const w = cfg().window;
  const width = widthPx();
  const pos = validPosition(w.x, w.y, width);

  win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width,
    height: contentHeight,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(cfg().window.zoom));

  win.once('ready-to-show', () => {
    win.showInactive();
    applyWindowSettings();
  });

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    store.update({ window: { x, y } });
  });

  win.on('blur', () => {
    if (cfg().window.mode === 'desktop') win32.sendToBottom(win);
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function applyMode(mode) {
  clearInterval(bottomTimer);
  bottomTimer = null;
  if (mode === 'top') {
    win32.detachFromDesktop(win);
    win.setAlwaysOnTop(true, 'floating');
  } else if (mode === 'desktop') {
    win.setAlwaysOnTop(false);
    win32.attachToDesktop(win);
    // 다른 창을 열거나 닫으면서 순서가 바뀔 수 있으므로 주기적으로 맨 아래로 되돌린다.
    bottomTimer = setInterval(() => {
      if (win && !win.isDestroyed() && !win.isFocused()) win32.sendToBottom(win);
    }, 1500);
  } else {
    win.setAlwaysOnTop(false);
    win32.detachFromDesktop(win);
  }
}

function applyWindowSettings() {
  if (!win) return;
  const w = cfg().window;
  applyMode(w.mode);
  win.setOpacity(Math.min(1, Math.max(0.2, w.opacity)));
  win.setMovable(!w.locked);
  win.setIgnoreMouseEvents(!!w.clickThrough, { forward: true });
  win.webContents.setZoomFactor(w.zoom);
  resizeToContent();
  refreshTray();
}

function resizeToContent() {
  if (!win) return;
  const zoom = cfg().window.zoom;
  const [x, y] = win.getPosition();
  const wa = screen.getDisplayNearestPoint({ x, y }).workArea;
  const maxH = wa.y + wa.height - y - 8;
  const h = Math.max(120, Math.min(Math.ceil(contentHeight * zoom), maxH));
  win.setBounds({ x, y, width: widthPx(), height: h });
}

function applyAutoStart(on) {
  app.setLoginItemSettings({
    openAtLogin: on,
    name: APP_NAME,
    path: process.execPath,
    args: app.isPackaged ? [] : [path.resolve(app.getAppPath())],
  });
}

// 전국 날씨 창 (일반 창, 필요할 때만 연다)
function openNationwide() {
  if (nationWin && !nationWin.isDestroyed()) {
    nationWin.show();
    nationWin.focus();
    return;
  }
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(1040, wa.width - 40);
  const height = Math.min(720, wa.height - 40);
  nationWin = new BrowserWindow({
    width, height,
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + (wa.height - height) / 2),
    minWidth: 760, minHeight: 520,
    frame: false,
    transparent: true,
    title: '전국 날씨',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  nationWin.loadFile(path.join(__dirname, 'renderer', 'nationwide.html'));
  nationWin.once('ready-to-show', () => nationWin.show());
  nationWin.on('closed', () => { nationWin = null; });
}

// ───────────────────────── 트레이 ─────────────────────────

function trayIcon() {
  // 32x32 BGRA 비트맵으로 원형 아이콘을 직접 그린다.
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const [r, g, b] = [0x8a, 0xb4, 0xff];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const inner = Math.hypot(x - 15.5, y - 15.5) < 7;
      const a = Math.max(0, Math.min(1, 15 - d));
      const i = (y * size + x) * 4;
      const [cr, cg, cb] = inner ? [255, 255, 255] : [r, g, b];
      buf[i] = cb; buf[i + 1] = cg; buf[i + 2] = cr; buf[i + 3] = Math.round(a * 255);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
}

function setWindow(patch) {
  store.update({ window: patch });
  applyWindowSettings();
  broadcastConfig();
}

function refreshTray() {
  if (!tray) return;
  const w = cfg().window;
  const radio = (label, mode) => ({
    label, type: 'radio', checked: w.mode === mode, click: () => setWindow({ mode }),
  });
  const opacityItems = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map((v) => ({
    label: `${Math.round(v * 100)}%`, type: 'radio', checked: Math.abs(w.opacity - v) < 0.01,
    click: () => setWindow({ opacity: v }),
  }));
  const zoomItems = [0.8, 0.9, 1, 1.1, 1.25, 1.5].map((v) => ({
    label: `${Math.round(v * 100)}%`, type: 'radio', checked: Math.abs(w.zoom - v) < 0.01,
    click: () => setWindow({ zoom: v }),
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '위젯 보이기', click: () => { win.showInactive(); applyWindowSettings(); } },
    { label: '설정…', click: () => { win.show(); win.webContents.send('open-settings'); } },
    { type: 'separator' },
    radio('바탕화면에 고정', 'desktop'),
    radio('일반 창', 'normal'),
    radio('항상 위에 표시', 'top'),
    { type: 'separator' },
    { label: '투명도', submenu: opacityItems },
    { label: '크기', submenu: zoomItems },
    {
      label: '컴팩트 모드 (시계와 오늘만)', type: 'checkbox', checked: !!cfg().appearance.compact,
      click: (i) => { store.update({ appearance: { compact: i.checked } }); broadcastConfig(); },
    },
    { label: '위치 잠금', type: 'checkbox', checked: w.locked, click: (i) => setWindow({ locked: i.checked }) },
    { label: '클릭 통과 (마우스 무시)', type: 'checkbox', checked: w.clickThrough, click: (i) => setWindow({ clickThrough: i.checked }) },
    { label: '위치 초기화', click: () => { const p = defaultPosition(widthPx()); win.setPosition(p.x, p.y); store.update({ window: p }); } },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행', type: 'checkbox', checked: cfg().autoStart,
      click: (i) => { store.update({ autoStart: i.checked }); applyAutoStart(i.checked); broadcastConfig(); },
    },
    { label: `빠른 입력${quick.hotkeyLabel() ? ` (${quick.hotkeyLabel().replace('Control', 'Ctrl')})` : ''}`, click: () => quick.showQuick() },
    { label: '전국 날씨 보기', click: () => openNationwide() },
    { label: '새로고침', click: () => win.reload() },
    { label: '종료', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Yusk Widget');
  tray.on('click', () => { win.showInactive(); applyWindowSettings(); });
  refreshTray();
}

function broadcastConfig() {
  const c = store.publicConfig();
  win?.webContents.send('config-changed', c);
  if (nationWin && !nationWin.isDestroyed()) nationWin.webContents.send('config-changed', c);
  refreshTray();
}

// ───────────────────────── IPC ─────────────────────────

ipcMain.handle('config:get', () => store.publicConfig());

ipcMain.handle('config:update', (_e, patch) => {
  store.update(patch);
  if (patch.window) applyWindowSettings();
  if ('autoStart' in patch) applyAutoStart(!!patch.autoStart);
  refreshTray();
  return store.publicConfig();
});

ipcMain.handle('secret:set', (_e, section, value) => {
  store.setSecret(section, (value || '').trim());
  return store.publicConfig();
});

ipcMain.on('window:content-height', (_e, h) => {
  contentHeight = h;
  resizeToContent();
});

ipcMain.handle('calendar:fetch', (_e, fromIso, toIso) => {
  const g = gcal.status().connected ? { email: cfg().google.email, list: gcal.listEvents } : null;
  return calendar.fetchEvents(cfg().calendar, new Date(fromIso), new Date(toIso), g);
});

// 구글 캘린더 (쓰기)
ipcMain.handle('gcal:status', () => gcal.status());
ipcMain.handle('gcal:import-client', async () => {
  const { dialog } = require('electron');
  const fs = require('fs');
  const r = await dialog.showOpenDialog(win, {
    title: 'OAuth 클라이언트 JSON 선택', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  return gcal.wrap(() => gcal.importClient(fs.readFileSync(r.filePaths[0], 'utf8')))();
});
ipcMain.handle('gcal:connect', gcal.wrap(() => gcal.connect()));
ipcMain.handle('gcal:disconnect', gcal.wrap(() => gcal.disconnect()));
ipcMain.handle('gcal:create', gcal.wrap((_e, input) => gcal.createEvent(input)));
ipcMain.handle('gcal:update', gcal.wrap((_e, id, input) => gcal.updateEvent(id, input)));
ipcMain.handle('gcal:delete', gcal.wrap((_e, id) => gcal.deleteEvent(id)));

ipcMain.handle('ai:status', () => llm.status());
ipcMain.handle('ai:presets', () => llm.PRESETS);
ipcMain.handle('ai:login', (_e, provider) => llm.login(provider));
ipcMain.handle('ai:logout', (_e, provider) => llm.logout(provider));
ipcMain.handle('ai:chat', async (e, text, context) => {
  const a = cfg().ai;
  const model = a.provider === 'claude' ? a.claudeModel : a.codexModel;
  const send = (ch, v) => { if (!e.sender.isDestroyed()) e.sender.send(ch, v); };
  const persona = { name: a.name, catTone: a.catTone, personaPreset: a.personaPreset, persona: a.persona, about: a.about, rules: a.rules };
  return llm.chat({ provider: a.provider, model, effort: a.effort, webSearch: a.webSearch, persona, text, context },
    (delta) => send('ai:delta', delta), (s) => send('ai:status', s));
});
ipcMain.handle('ai:reset', () => llm.reset());
ipcMain.handle('ai:history', () => llm.getHistory());
ipcMain.handle('ai:abort', () => llm.abort());

ipcMain.handle('weather:locations', (_e, force) =>
  weather.fetchPlaces(store.getSecret('weather'), cfg().weather.locations, force));
ipcMain.handle('weather:nationwide', (_e, force) =>
  weather.fetchPlaces(store.getSecret('weather'), weather.NATIONWIDE, force));
ipcMain.handle('weather:search', (_e, q) => weather.searchCity(q));
ipcMain.handle('weather:open-nationwide', () => openNationwide());
ipcMain.handle('window:show-widget', () => { win?.show(); win?.focus(); });
ipcMain.handle('window:close-self', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
});

// ───────────────────────── 시작 ─────────────────────────

app.whenReady().then(() => {
  store.load();
  ensureStartMenuShortcut();
  memos.register(() => win);
  quick.register(() => win);
  // 뭉치와의 대화를 파일로 저장해 두었다가 다시 켤 때 이어서 보여 준다
  const chatFile = path.join(app.getPath('userData'), 'chat-history.json');
  const fsx = require('fs');
  llm.setPersistence({
    load: () => JSON.parse(fsx.readFileSync(chatFile, 'utf8')),
    save: (list) => fsx.writeFileSync(chatFile, JSON.stringify(list), 'utf8'),
  });
  // 최초 1회: 환경변수로 받은 기상청 인증키를 암호화 저장소로 옮긴다
  if (process.env.KMA_SERVICE_KEY && !store.getSecret('weather')) {
    store.setSecret('weather', process.env.KMA_SERVICE_KEY);
  }
  createWindow();
  createTray();
  screen.on('display-metrics-changed', resizeToContent);

  // 개발용: WIDGET_CAPTURE=폴더 로 실행하면 위젯과 전국 날씨 창을 PNG로 저장한다
  if (process.env.WIDGET_CAPTURE) {
    const fs = require('fs');
    const dir = process.env.WIDGET_CAPTURE;
    const logFile = path.join(dir, 'cap-console.log');
    fs.writeFileSync(logFile, '');
    win.webContents.on('console-message', (e) => fs.appendFileSync(logFile, `[${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})\n`));
    setTimeout(async () => {
      if (process.env.WIDGET_CAPTURE_JS) await win.webContents.executeJavaScript(process.env.WIDGET_CAPTURE_JS);
      await new Promise((r) => setTimeout(r, 500));
      fs.writeFileSync(path.join(dir, 'cap-widget.png'), (await win.webContents.capturePage()).toPNG());
      // 메모 팝업 등 다른 창도 저장한다 (필요하면 그 창에서 스크립트를 먼저 실행)
      const others = BrowserWindow.getAllWindows().filter((w) => w !== win && w !== nationWin);
      for (const [i, w] of others.entries()) {
        if (process.env.WIDGET_CAPTURE_POPUP_JS) await w.webContents.executeJavaScript(process.env.WIDGET_CAPTURE_POPUP_JS);
        await new Promise((r) => setTimeout(r, 400));
        fs.writeFileSync(path.join(dir, `cap-popup-${i}.png`), (await w.webContents.capturePage()).toPNG());
      }
      if (process.env.WIDGET_CAPTURE_ONLY) return;
      openNationwide();
      setTimeout(async () => {
        fs.writeFileSync(path.join(dir, 'cap-nation.png'), (await nationWin.webContents.capturePage()).toPNG());
      }, 12000);
    }, 6000);
  }
});

app.on('before-quit', () => store.flush());
app.on('will-quit', () => quick.unregisterAll());
app.on('window-all-closed', () => app.quit());

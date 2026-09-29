// flex 근무 시간: 하루 한 번, 숨긴 창에서 flex 화면을 열어 "근무 중 7시간 15분" 같은 글자를 읽는다.
//  - 로그인은 사용자가 위젯 전용 창에서 직접 한다 (비밀번호는 위젯이 보거나 저장하지 않음, 쿠키만 전용 세션에 유지)
//  - 계기: 그날 처음 인터넷 브라우저가 켜졌을 때 (또는 "지금 불러오기")
//  - 공식 API 가 아니므로 화면이 바뀌면 읽기에 실패할 수 있다 → 실패 시 값을 추측하지 않고 "읽지 못함"으로 둔다
const { BrowserWindow, ipcMain, session } = require('electron');
const { execFile } = require('child_process');
const store = require('./store');

const PARTITION = 'persist:flex';
const HOME = 'https://flex.team/home';
const BROWSERS = ['chrome.exe', 'msedge.exe', 'whale.exe', 'firefox.exe', 'brave.exe', 'opera.exe'];
const UA = () => session.fromPartition(PARTITION).getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*yusk-widget\/\S+/i, '');

let fetching = null;
let loginWin = null;
let onChange = () => {};

const today = () => new Date().toDateString();
const work = () => store.get().work || {};
const save = (patch) => { store.update({ work: patch }); onChange(); };

// 화면 글자에서 근무 상태와 시간을 찾는다
function parseWorkText(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const m = t.match(/(근무\s*중|휴게\s*중|외근\s*중|재택\s*근무\s*중|출장\s*중)\s*(?:(\d{1,2})\s*시간)?\s*(?:(\d{1,2})\s*분)?/);
  if (m && (m[2] || m[3])) {
    return { status: m[1].replace(/\s+/g, ' '), minutes: Number(m[2] || 0) * 60 + Number(m[3] || 0) };
  }
  if (/퇴근\s*(완료|했|함|\d)/.test(t) || /근무\s*종료/.test(t)) return { status: '퇴근', minutes: null };
  if (/근무\s*전|출근\s*전|출근하기/.test(t)) return { status: '근무 전', minutes: null };
  return null;
}

function hiddenWindow() {
  const w = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  w.webContents.setUserAgent(UA());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.setAudioMuted(true);
  return w;
}

const looksLikeLogin = (url, text) => /\/(login|signin|auth)/i.test(url) || /비밀번호|로그인하기|Sign in/i.test(text.slice(0, 3000));

async function fetchNow(reason = 'manual') {
  if (fetching) return fetching;
  fetching = (async () => {
    const w = hiddenWindow();
    try {
      await w.loadURL(HOME).catch(() => {});
      // 화면이 다 그려질 때까지 최대 25초 기다리며 글자를 찾는다
      let text = '';
      let parsed = null;
      for (let i = 0; i < 25 && !parsed; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (w.isDestroyed()) break;
        text = await w.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
        if (looksLikeLogin(w.webContents.getURL(), text)) {
          save({ state: 'login', checkedAt: Date.now() });
          return { ok: false, state: 'login' };
        }
        parsed = parseWorkText(text);
      }
      if (!parsed) {
        save({ state: 'unreadable', checkedAt: Date.now() });
        return { ok: false, state: 'unreadable' };
      }
      const now = Date.now();
      const patch = { state: 'ok', status: parsed.status, fetchedAt: now, fetchedDay: today(), reason };
      if (parsed.minutes != null) {
        patch.minutesAtFetch = parsed.minutes;
        patch.clockInAt = now - parsed.minutes * 60e3; // 휴게 시간을 빼고 계산하는 flex 기준이면 실제 출근보다 늦게 보일 수 있다
      } else {
        patch.minutesAtFetch = null;
      }
      save(patch);
      return { ok: true, ...patch };
    } finally {
      if (!w.isDestroyed()) w.destroy();
      fetching = null;
    }
  })();
  return fetching;
}

// 사용자가 직접 로그인하는 창
function openLogin() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({
    width: 520, height: 760, title: 'flex 로그인 (Yusk Widget)', autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  loginWin.webContents.setUserAgent(UA());
  loginWin.loadURL(HOME);
  // 로그인 뒤 flex 화면으로 넘어오면 창을 닫고 바로 읽는다
  const check = async () => {
    if (!loginWin || loginWin.isDestroyed()) return;
    const url = loginWin.webContents.getURL();
    const text = await loginWin.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
    if (/^https:\/\/flex\.team\//.test(url) && !looksLikeLogin(url, text) && parseWorkText(text)) {
      loginWin.close();
      fetchNow('login');
    }
  };
  const timer = setInterval(check, 2000);
  loginWin.on('closed', () => { clearInterval(timer); loginWin = null; });
}

async function disconnect() {
  await session.fromPartition(PARTITION).clearStorageData();
  save({ state: 'login', status: null, clockInAt: null, minutesAtFetch: null, fetchedDay: null });
}

// 그날 처음 브라우저가 켜지면 한 번 읽는다
function watchBrowsers() {
  setInterval(() => {
    const w = work();
    if (w.enabled === false || w.fetchedDay === today() || w.state === 'login' || fetching) return;
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) return;
      const names = new Set(out.split('\n').map((l) => l.split('","')[0].replace(/^"/, '').toLowerCase()));
      if (BROWSERS.some((b) => names.has(b))) fetchNow('browser');
    });
  }, 60e3);
}

function register(changed) {
  onChange = changed;
  watchBrowsers();
  ipcMain.handle('flex:status', () => work());
  ipcMain.handle('flex:fetch', () => fetchNow('manual'));
  ipcMain.handle('flex:login', () => openLogin());
  ipcMain.handle('flex:disconnect', () => disconnect());
  ipcMain.handle('flex:set-enabled', (_e, on) => { save({ enabled: !!on }); return work(); });
}

module.exports = { register, _internal: { parseWorkText } };

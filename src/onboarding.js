// 처음 설정(온보딩) 창: 정말 처음 설치했을 때만 뜨고, 설정에서 다시 열 수 있다.
// 단계별 값은 바로바로 저장한다(중간에 꺼도 이어서 시작). 위젯 창은 배치 단계부터 함께 보인다.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const store = require('./store');
const weather = require('./weather');

let ob = null;
let deps = null; // { getWin, widthPx, contentHeight, applyWindowSettings, broadcastConfig, log, icon }

const state = () => ({ done: false, step: 0, skipped: [], ...(store.get().onboarding || {}) });

function open(step) {
  if (ob && !ob.isDestroyed()) { ob.show(); ob.focus(); return ob; }
  ob = new BrowserWindow({
    width: 520, height: 660, frame: false, transparent: true, resizable: false, maximizable: false,
    fullscreenable: false, center: true, show: false, title: '뭉치위젯 처음 설정', icon: deps.icon,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  ob.loadFile(path.join(__dirname, 'renderer', 'onboarding.html'), { query: { step: String(step ?? state().step ?? 0) } });
  ob.once('ready-to-show', () => { ob.show(); ob.focus(); });
  ob.on('closed', () => {
    ob = null;
    // 끝내지 않고 닫아도 위젯은 보이게 한다 (다음 실행 때 이어서 시작)
    const w = deps.getWin();
    if (w && !w.isDestroyed() && !w.isVisible()) { w.showInactive(); deps.applyWindowSettings(); }
  });
  return ob;
}

// 모니터 목록: 실제 배치(좌표) 그대로 그릴 수 있게 넘긴다
function displays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, index: i + 1, primary: d.id === primary, bounds: d.bounds, workArea: d.workArea,
    size: `${Math.round(d.bounds.width * d.scaleFactor)} × ${Math.round(d.bounds.height * d.scaleFactor)}`,
  }));
}

// 고른 모니터의 모서리에 위젯을 둔다 (여백 24px)
function place(displayId, corner) {
  const win = deps.getWin();
  if (!win || win.isDestroyed()) return null;
  const d = screen.getAllDisplays().find((x) => x.id === displayId) || screen.getPrimaryDisplay();
  const a = d.workArea;
  const w = deps.widthPx();
  const h = Math.min(deps.contentHeight(), a.height - 48);
  const x = corner.endsWith('left') ? a.x + 24 : a.x + a.width - w - 24;
  const y = corner.startsWith('top') ? a.y + 24 : a.y + a.height - h - 24;
  win.setPosition(Math.round(x), Math.round(y));
  store.update({ window: { x: Math.round(x), y: Math.round(y), displayId: d.id, corner } });
  return { x, y };
}

function register(d) {
  deps = d;
  ipcMain.handle('onb:state', () => ({ ...state(), displays: displays() }));
  ipcMain.handle('onb:save', (_e, patch) => {
    store.update({ onboarding: { ...state(), ...patch } });
    return state();
  });
  ipcMain.handle('onb:place', (_e, displayId, corner) => place(displayId, corner));
  ipcMain.handle('onb:show-widget', () => {
    const w = deps.getWin();
    if (w && !w.isDestroyed()) { w.showInactive(); deps.applyWindowSettings(); }
    ob?.focus();
  });
  // 기상청 키 확인: 실제로 날씨를 받아 와 보고, 성공하면 그때 저장한다
  ipcMain.handle('onb:weather-test', async (_e, key) => {
    const k = String(key || '').trim();
    if (!k) return { ok: false, error: '인증키를 붙여 넣어 주세요.' };
    const loc = store.get().weather.locations[0] || { name: '서울', latitude: 37.5665, longitude: 126.978 };
    try {
      const r = await weather.fetchWeather({ key: k, latitude: loc.latitude, longitude: loc.longitude, hours: 3 });
      store.setSecret('weather', k);
      deps.broadcastConfig();
      return { ok: true, name: loc.name, temp: r.current.temp, desc: r.current.desc };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('onb:finish', (_e, skipped) => {
    store.update({ onboarding: { done: true, step: 8, skipped: Array.isArray(skipped) ? skipped : [] } });
    store.flush();
    deps.log('onboarding-finished', { skipped });
    const w = deps.getWin();
    if (w && !w.isDestroyed()) { w.show(); deps.applyWindowSettings(); }
    deps.broadcastConfig();
    ob?.close();
  });
  ipcMain.handle('onb:open', (_e, step) => { open(step); });
}

module.exports = { register, open, state };

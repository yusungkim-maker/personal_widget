// 설정/데이터를 userData 폴더의 JSON 파일에 저장한다.
//
// 원칙: 한 번 넣은 설정과 키는 사용자가 직접 지우기 전에는 절대 바뀌거나 사라지지 않는다.
//  1. 쓰기는 임시 파일에 쓴 뒤 바꿔치기(원자적 저장) → 쓰다가 꺼져도 파일이 깨지지 않는다.
//  2. 저장할 때마다 직전 정상본을 config.json.bak 으로 남긴다.
//  3. 읽기에 실패하면 기본값으로 덮어쓰지 않고 .bak → 자동 백업 → (예전) 격리 저장소 순서로 복구한다.
//  4. 키·토큰은 금고 파일 두 곳(Roaming, Local)에도 따로 보관해, 설정 파일에서 빠져도 되살린다.
//  5. 빈 값으로 키를 덮어쓰는 쓰기는 모두 무시한다. 지우기는 clearSecret() (사용자 동작)만 가능.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  window: {
    mode: 'desktop', // desktop | normal | top
    opacity: 1,
    zoom: 1,
    locked: false,
    clickThrough: false,
    x: null,
    y: null,
  },
  appearance: {
    theme: 'dark', // dark | light
    accent: '#8ab4ff',
    glass: 0.65, // 배경 농도 (0~1) — 디자인 시스템 opacity-glass
    clock24h: true,
    compact: false, // 컴팩트 모드: 시계 + 오늘 카드만
    showSeconds: false,
  },
  sections: {
    clock: true,
    weather: true,
    calendar: true,
    todo: true,
    ai: true,
    memo: true,
  },
  weather: {
    locations: [
      { name: '서울', latitude: 37.5665, longitude: 126.978 },
      { name: '성남', latitude: 37.42, longitude: 127.1267 },
    ],
    keyEnc: null, // 기상청 인증키 (safeStorage 암호화)
  },
  calendar: {
    icalUrls: [],
    koreanHolidays: true,
  },
  google: {
    clientId: '',   // Google Cloud "데스크톱 앱" OAuth 클라이언트 ID
    email: '',      // 연결된 계정
    // 클라이언트 비밀값과 토큰은 secrets(safeStorage) 에 따로 저장
  },
  secrets: {},
  ai: {
    provider: 'claude', // claude (Claude Code 로그인) | codex (ChatGPT 로그인)
    claudeModel: 'opus',
    codexModel: null, // null 이면 Codex 기본 모델
    effort: 'low',
    webSearch: true,
    shareMemos: true, // 최근 메모를 뭉치에게 보여 줄지 (비밀값처럼 보이는 부분은 항상 가림)
    // 모든 대화에 자동으로 들어가는 성격·지침 (새 대화를 시작해도 유지)
    name: '뭉치',
    profile: 'bsh-gray', // 회색 브리티시 쇼트헤어
    personaPreset: 'pro',
    catTone: true, // 성격은 그대로 두고 말투만 고양이처럼
    persona: '',  // 비어 있으면 프리셋 문구를 쓴다
    about: '',    // 나에 대해
    rules: '',    // 항상 지킬 지침
  },
  collapsed: {}, // 접은 카드 { weather: true, ... }
  notify: { events: true, eventMinutes: 10, todos: true, todoTime: '09:00' },
  brief: { enabled: true, time: '08:30', last: '' }, // 아침 브리핑
  backup: { last: null, extraDir: '' },               // 자동 백업
  work: { enabled: true, state: 'login' },            // flex 근무 시간 (하루 한 번 화면에서 읽음)
  quick: { hotkey: 'Control+Alt+M', userSet: false }, // 빠른 입력 단축키 ('' 이면 끔)
  todos: [],
  memos: [], // { id, title, body, color, createdAt, updatedAt }
  autoStart: false,
};

// 비밀값 위치: weather 는 예전 위치(weather.keyEnc)를 유지하고, 나머지는 secrets 아래에 둔다
const SECRET_FIELD = { weather: 'keyEnc', google: 'google', googleToken: 'googleToken' };
const SECTIONS = Object.keys(SECRET_FIELD);

const dirOf = () => app.getPath('userData');
const file = () => path.join(dirOf(), 'config.json');
const bakFile = () => `${file()}.bak`;
// 금고: 같은 폴더 + Local 쪽 사본 (Roaming 폴더가 통째로 문제여도 키는 남는다)
const vaultFiles = () => [
  path.join(dirOf(), 'vault.json'),
  path.join(process.env.LOCALAPPDATA || path.join(dirOf(), '..'), 'Yusk Widget', 'vault.json'),
];

let log = () => {};
function setLogger(fn) { log = fn; }

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = merge(base[k], over[k]);
  return out;
}

// ── 파일 ──
function readJson(f) {
  // 메모장 등으로 편집하면 BOM 이 붙을 수 있으므로 제거하고 읽는다
  return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
}

function writeAtomic(f, text) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, f);
}

// ── 비밀값 도우미 ──
const getField = (d, s) => (s === 'weather' ? d?.weather?.keyEnc : d?.secrets?.[SECRET_FIELD[s]]) || null;
function setField(d, s, v) {
  if (s === 'weather') { d.weather = d.weather || {}; d.weather.keyEnc = v; } else { d.secrets = d.secrets || {}; d.secrets[SECRET_FIELD[s]] = v; }
}

// 다음 상태에서 빠진 키는 이전 값으로 되살린다 (빈 값 덮어쓰기 방지)
function keepSecrets(next, prev) {
  for (const s of SECTIONS) {
    const before = getField(prev, s);
    if (before && !getField(next, s)) {
      setField(next, s, before);
      log('secret-kept', { section: s });
    }
  }
  return next;
}

// ── 금고 ──
function readVault() {
  const out = {};
  for (const f of vaultFiles()) {
    try {
      const v = readJson(f);
      for (const s of SECTIONS) if (v?.[s] && !out[s]) out[s] = v[s];
    } catch { /* 없거나 깨졌으면 다른 사본 */ }
  }
  return out;
}

function writeVault(d) {
  const v = readVault();
  let changed = false;
  for (const s of SECTIONS) {
    const cur = getField(d, s);
    if (cur && v[s] !== cur) { v[s] = cur; changed = true; }
  }
  if (!changed && vaultFiles().every((f) => fs.existsSync(f))) return;
  for (const f of vaultFiles()) {
    try { writeAtomic(f, JSON.stringify(v, null, 2)); } catch (e) { log('vault-write-failed', { file: f, message: e.message }); }
  }
}

// ── 복구 후보 ──
function backupCandidates() {
  const out = [];
  try {
    const dir = path.join(dirOf(), 'backups');
    const files = fs.readdirSync(dir).filter((f) => /^backup-.*\.json$/.test(f))
      .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files) out.push({ source: `backup:${path.basename(f)}`, read: () => readJson(f).config });
  } catch { /* 백업 폴더 없음 */ }
  // 예전에 Claude 앱 안에서 실행됐을 때 격리 저장소에 쌓인 설정
  try {
    const pk = path.join(process.env.LOCALAPPDATA || '', 'Packages');
    for (const d of fs.readdirSync(pk).filter((x) => /^Claude_/.test(x))) {
      const f = path.join(pk, d, 'LocalCache', 'Roaming', path.basename(dirOf()), 'config.json');
      if (fs.existsSync(f)) out.push({ source: `sandbox:${d}`, read: () => readJson(f) });
    }
  } catch { /* 없음 */ }
  return out;
}

// 사용자가 실제로 넣은 값이 있는지 (기본값만 든 백업은 복구에 쓰지 않는다)
const hasUserData = (c) => !!(c && (getField(c, 'weather') || c.secrets?.google || c.calendar?.icalUrls?.length || c.todos?.length || c.memos?.length || c.google?.clientId || c.ai?.about || c.ai?.persona));

let data = null;
let loadedFrom = null;

function load() {
  let raw = null;
  const tries = [
    { source: 'config', read: () => readJson(file()) },
    { source: 'config.bak', read: () => readJson(bakFile()) },
  ];
  const mainExists = fs.existsSync(file());
  for (const t of tries) {
    try { raw = t.read(); loadedFrom = t.source; break; } catch (e) {
      if (t.source === 'config' && mainExists) log('config-unreadable', { message: e.message });
    }
  }
  // 파일이 없거나(처음 실행이 아니라면) 비어 있으면 백업에서 되살린다
  if (!raw || !hasUserData(raw)) {
    for (const c of backupCandidates()) {
      try {
        const v = c.read();
        if (hasUserData(v)) { raw = v; loadedFrom = c.source; log('config-recovered', { from: c.source }); break; }
      } catch { /* 다음 후보 */ }
    }
  }
  if (mainExists && loadedFrom !== 'config') {
    // 깨진 원본은 지우지 않고 옆에 남겨 둔다
    try { fs.copyFileSync(file(), path.join(dirOf(), `config.unreadable-${Date.now()}.json`)); } catch { /* 무시 */ }
  }
  data = merge(DEFAULTS, raw || {});
  // 금고에만 남아 있는 키는 되살리고, 설정에만 있는 키는 금고에 넣는다
  const vault = readVault();
  let healed = false;
  for (const s of SECTIONS) {
    if (!getField(data, s) && vault[s]) { setField(data, s, vault[s]); healed = true; log('secret-restored', { section: s, from: 'vault' }); }
  }
  log('config-loaded', { from: loadedFrom || 'defaults', keys: SECTIONS.filter((s) => getField(data, s)) });
  if (raw && (loadedFrom !== 'config' || healed)) flush();
  else writeVault(data);
  return data;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  const text = JSON.stringify(data, null, 2);
  // 직전 정상본을 .bak 으로 남긴다 (읽을 수 있는 파일만)
  try {
    if (fs.existsSync(file())) { readJson(file()); fs.copyFileSync(file(), bakFile()); }
  } catch { /* 원본이 깨졌으면 .bak 은 그대로 둔다 */ }
  try {
    writeAtomic(file(), text);
  } catch (e) {
    log('config-write-failed', { message: e.message });
  }
  writeVault(data);
}

function get() {
  return data || load();
}

// 렌더러에 넘길 때는 암호화된 키를 빼고 보낸다.
function publicConfig() {
  const c = structuredClone(get());
  c.weather.hasKey = !!c.weather.keyEnc;
  delete c.ai.apiKeyEnc; // 예전 버전의 API 키 (더 이상 쓰지 않음)
  delete c.weather.keyEnc;
  delete c.secrets;
  return c;
}

// 백업에서 되돌릴 때: 통째로 바꾸고 바로 저장 (키는 빈 값으로 덮지 않는다)
function replace(next) {
  const prev = get();
  data = keepSecrets(merge(DEFAULTS, next || {}), prev);
  flush();
  return data;
}

function update(patch) {
  const prev = get();
  // 렌더러가 보낸 조각에는 키가 들어 있을 수 없다 → 비밀값 칸은 무시
  const p = structuredClone(patch || {});
  if (p.weather) { delete p.weather.keyEnc; delete p.weather.hasKey; }
  delete p.secrets;
  data = keepSecrets(merge(prev, p), prev);
  save();
  return data;
}

// 비밀값(API 키)은 safeStorage 로 암호화해서 저장한다. 빈 값은 무시한다.
function setSecret(section, value) {
  if (!SECRET_FIELD[section]) throw new Error(`알 수 없는 비밀값: ${section}`);
  if (!value) { log('secret-empty-ignored', { section }); return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('이 PC에서는 키 암호화를 사용할 수 없습니다.');
  setField(get(), section, safeStorage.encryptString(value).toString('base64'));
  log('secret-set', { section });
  flush();
}

// 사용자가 직접 "연결 끊기" 할 때만 쓴다
function clearSecret(section, reason) {
  setField(get(), section, null);
  const v = readVault();
  delete v[section];
  for (const f of vaultFiles()) {
    try { writeAtomic(f, JSON.stringify(v, null, 2)); } catch { /* 무시 */ }
  }
  log('secret-cleared', { section, reason });
  flush();
}

function getSecret(section) {
  const enc = getField(get(), section);
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) {
    // 풀지 못해도 지우지 않는다 (다른 계정/PC 에서 연 경우 등)
    log('secret-decrypt-failed', { section, message: e.message });
    return null;
  }
}

module.exports = { load, get, update, replace, save, flush, publicConfig, setSecret, clearSecret, getSecret, setLogger, loadedFrom: () => loadedFrom, _internal: { merge, keepSecrets, hasUserData } };

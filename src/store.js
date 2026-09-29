// 설정/데이터를 userData 폴더의 JSON 파일에 저장한다.
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
    glass: 0.72, // 배경 농도 (0~1)
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
  quick: { hotkey: 'Control+Alt+M', userSet: false }, // 빠른 입력 단축키 ('' 이면 끔)
  todos: [],
  memos: [], // { id, title, body, color, createdAt, updatedAt }
  autoStart: false,
};

const file = () => path.join(app.getPath('userData'), 'config.json');

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = merge(base[k], over[k]);
  return out;
}

let data = null;

function load() {
  try {
    // 메모장 등으로 편집하면 BOM 이 붙을 수 있으므로 제거하고 읽는다
    data = merge(DEFAULTS, JSON.parse(fs.readFileSync(file(), 'utf8').replace(/^﻿/, '')));
  } catch {
    data = structuredClone(DEFAULTS);
  }
  return data;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function flush() {
  clearTimeout(saveTimer);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2), 'utf8');
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

function update(patch) {
  data = merge(get(), patch);
  save();
  return data;
}

// 비밀값(API 키)은 safeStorage 로 암호화해서 저장한다.
const SECRET_FIELD = { weather: 'keyEnc', google: 'google', googleToken: 'googleToken' };
// weather 는 예전 위치(weather.keyEnc)를 유지하고, 나머지는 secrets 아래에 둔다
const secretHolder = (section) => (section === 'weather' ? get().weather : get().secrets);

function setSecret(section, value) {
  const field = SECRET_FIELD[section];
  if (!value) {
    secretHolder(section)[field] = null;
  } else if (safeStorage.isEncryptionAvailable()) {
    secretHolder(section)[field] = safeStorage.encryptString(value).toString('base64');
  } else {
    throw new Error('이 PC에서는 키 암호화를 사용할 수 없습니다.');
  }
  save();
}

function getSecret(section) {
  const enc = secretHolder(section)[SECRET_FIELD[section]];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

module.exports = { load, get, update, save, flush, publicConfig, setSecret, getSecret };

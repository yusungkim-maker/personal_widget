// Google Calendar API 연동 (일정 읽기·추가·수정·삭제)
//  - 설치형 앱 OAuth: 루프백(127.0.0.1) 리디렉션 + PKCE
//  - 권한은 최소한으로: 일정(events) + 계정 이메일 확인(openid email)
//  - 토큰과 클라이언트 비밀값은 safeStorage 로 암호화해서 저장
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const store = require('./store');

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
const CONNECT_TIMEOUT_MS = 5 * 60e3;

class GcalError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const g = () => store.get().google;

// ───────────────────────── 클라이언트 설정 ─────────────────────────

// Google Cloud 에서 받은 "데스크톱 앱" OAuth 클라이언트 JSON 을 읽는다
function importClient(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new GcalError('BAD_CLIENT', 'JSON 파일을 읽을 수 없어요. Google Cloud 에서 받은 파일이 맞는지 확인해 주세요.');
  }
  const c = j.installed || j.web;
  if (!c?.client_id || !c?.client_secret) {
    throw new GcalError('BAD_CLIENT', 'OAuth 클라이언트 정보가 없어요. "데스크톱 앱" 유형으로 만든 클라이언트의 JSON 을 넣어 주세요.');
  }
  if (!j.installed) {
    throw new GcalError('BAD_CLIENT', '"웹 애플리케이션"이 아니라 "데스크톱 앱" 유형으로 만든 클라이언트가 필요해요.');
  }
  store.update({ google: { clientId: c.client_id } });
  store.setSecret('google', JSON.stringify({ clientSecret: c.client_secret }));
  return status();
}

function clientSecret() {
  try {
    return JSON.parse(store.getSecret('google') || '{}').clientSecret || null;
  } catch {
    return null;
  }
}

function tokens() {
  try {
    return JSON.parse(store.getSecret('googleToken') || 'null');
  } catch {
    return null;
  }
}

function saveTokens(t) {
  if (!t) return; // 토큰은 "연결 끊기"(disconnect) 로만 지운다
  store.setSecret('googleToken', JSON.stringify(t));
  if (g().expired) store.update({ google: { expired: false } });
}

function status() {
  const c = g();
  return {
    hasClient: !!c.clientId && !!clientSecret(),
    connected: !!tokens()?.refresh_token && !c.expired,
    expired: !!c.expired, // 구글이 로그인을 만료시킴 → 다시 연결하면 된다 (저장된 값은 그대로)
    email: c.email || '',
    connecting: !!connectJob,
  };
}

// ───────────────────────── OAuth 연결 ─────────────────────────

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeJwtEmail(idToken) {
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')).email || '';
  } catch {
    return '';
  }
}

const DONE_PAGE = (ok, msg) => `<!doctype html><meta charset="utf-8"><title>뭉치위젯</title>
<body style="font-family:'Segoe UI','Malgun Gothic',sans-serif;background:#12141c;color:#eef1f7;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:44px">${ok ? '🐾' : '⚠️'}</div>
<h2 style="margin:10px 0 6px">${ok ? '구글 캘린더가 연결됐어요' : '연결하지 못했어요'}</h2>
<p style="color:#9aa3b5">${msg}</p></div></body>`;

let connectJob = null;

function connect() {
  if (connectJob) return connectJob;
  const clientId = g().clientId;
  const secret = clientSecret();
  if (!clientId || !secret) return Promise.reject(new GcalError('NO_CLIENT', '먼저 OAuth 클라이언트 JSON 을 가져와 주세요.'));

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  connectJob = new Promise((resolve, reject) => {
    const server = http.createServer();
    let timer = null;
    const finish = (err, value) => {
      clearTimeout(timer);
      server.close();
      err ? reject(err) : resolve(value);
    };

    server.on('request', async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/') { res.writeHead(404).end(); return; }
      const send = (ok, msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(DONE_PAGE(ok, msg));
      };
      if (url.searchParams.get('state') !== state) { send(false, '잘못된 요청이에요. 위젯에서 다시 시도해 주세요.'); return; }
      const err = url.searchParams.get('error');
      if (err) {
        send(false, err === 'access_denied' ? '권한 허용을 취소했어요.' : '구글에서 오류를 돌려줬어요.');
        finish(new GcalError('DENIED', err === 'access_denied' ? '권한 허용이 취소됐어요.' : '구글 로그인 중 오류가 났어요.'));
        return;
      }
      try {
        const redirectUri = `http://127.0.0.1:${server.address().port}`;
        const t = await tokenRequest({
          grant_type: 'authorization_code', code: url.searchParams.get('code'), code_verifier: verifier,
          client_id: clientId, client_secret: secret, redirect_uri: redirectUri,
        });
        if (!t.refresh_token) throw new GcalError('NO_REFRESH', '장기 사용 권한을 받지 못했어요. 다시 연결해 주세요.');
        const granted = (t.scope || '').split(' ');
        if (!granted.includes('https://www.googleapis.com/auth/calendar.events')) {
          throw new GcalError('SCOPE', '캘린더 일정 권한이 허용되지 않았어요. 연결할 때 캘린더 권한에 체크해 주세요.');
        }
        saveTokens({ refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 });
        const email = decodeJwtEmail(t.id_token);
        store.update({ google: { email } });
        send(true, `${email || '계정'} · 이 창은 닫아도 돼요.`);
        finish(null, status());
      } catch (e) {
        send(false, e.message);
        finish(e instanceof GcalError ? e : new GcalError('TOKEN', '토큰을 받지 못했어요. 다시 시도해 주세요.'));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const redirectUri = `http://127.0.0.1:${server.address().port}`;
      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
      shell.openExternal(`${AUTH_URL}?${params}`);
      timer = setTimeout(() => finish(new GcalError('TIMEOUT', '로그인이 5분 안에 끝나지 않았어요. 다시 시도해 주세요.')), CONNECT_TIMEOUT_MS);
    });
    server.on('error', () => finish(new GcalError('SERVER', '로그인용 로컬 서버를 열지 못했어요.')));
  }).finally(() => { connectJob = null; });
  return connectJob;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === 'invalid_grant') throw new GcalError('EXPIRED', '구글 연결이 만료됐어요. 설정에서 다시 연결해 주세요.');
    if (j.error === 'invalid_client') throw new GcalError('BAD_CLIENT', 'OAuth 클라이언트 정보가 맞지 않아요. JSON 파일을 다시 가져와 주세요.');
    throw new GcalError('TOKEN', '구글 인증 서버와 통신하지 못했어요.');
  }
  return j;
}

async function accessToken(force = false) {
  const t = tokens();
  if (!t?.refresh_token) throw new GcalError('NOT_CONNECTED', '구글 계정이 연결되어 있지 않아요.');
  if (!force && t.access_token && Date.now() < t.expires_at) return t.access_token;
  try {
    const r = await tokenRequest({
      grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: g().clientId, client_secret: clientSecret(),
    });
    saveTokens({ ...t, access_token: r.access_token, expires_at: Date.now() + (r.expires_in - 60) * 1000 });
    return r.access_token;
  } catch (e) {
    // 만료돼도 토큰·계정은 지우지 않고 "다시 연결 필요"만 표시한다
    if (e.code === 'EXPIRED') store.update({ google: { expired: true } });
    throw e;
  }
}

async function disconnect() {
  const t = tokens();
  if (t?.refresh_token) {
    // 구글 쪽 권한도 함께 철회한다 (실패해도 로컬 토큰은 지운다)
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t.refresh_token)}`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  store.clearSecret('googleToken', 'user-disconnect');
  store.update({ google: { email: '', expired: false } });
  return status();
}

// ───────────────────────── Calendar API ─────────────────────────

async function api(method, path, body, retry = true) {
  const token = await accessToken();
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GcalError('NETWORK', '네트워크에 연결할 수 없어요.');
  }
  if (res.status === 401 && retry) {
    await accessToken(true);
    return api(method, path, body, false);
  }
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) throw new GcalError('FORBIDDEN', '이 캘린더에 일정을 쓸 권한이 없어요.');
    if (res.status === 404 || res.status === 410) throw new GcalError('GONE', '이미 삭제된 일정이에요.');
    if (res.status === 429) throw new GcalError('RATE', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    throw new GcalError('API', '구글 캘린더에 반영하지 못했어요. 다시 시도해 주세요.');
  }
  return j;
}

const { fromGoogle, toGoogle } = require('./gcal-format');

async function listEvents(from, to) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      timeMin: from.toISOString(), timeMax: to.toISOString(), ...(pageToken && { pageToken }),
    });
    const j = await api('GET', `/calendars/primary/events?${q}`);
    out.push(...(j.items || []).filter((e) => e.status !== 'cancelled').map(fromGoogle));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

const createEvent = async (input) => fromGoogle(await api('POST', '/calendars/primary/events', toGoogle(input)));
const updateEvent = async (id, input) => fromGoogle(await api('PATCH', `/calendars/primary/events/${encodeURIComponent(id)}`, toGoogle(input)));
async function deleteEvent(id) {
  try {
    await api('DELETE', `/calendars/primary/events/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e.code !== 'GONE') throw e; // 이미 지워졌으면 성공으로 본다
  }
  return { ok: true };
}

// 에러를 IPC 로 넘길 수 있는 형태로
const wrap = (fn) => async (...args) => {
  try {
    return { ok: true, value: await fn(...args) };
  } catch (e) {
    return { ok: false, code: e.code || 'UNKNOWN', error: e instanceof GcalError ? e.message : '알 수 없는 오류가 났어요.' };
  }
};

module.exports = {
  status, importClient, connect, disconnect, listEvents, createEvent, updateEvent, deleteEvent, wrap,
  _internal: { toGoogle, fromGoogle },
};

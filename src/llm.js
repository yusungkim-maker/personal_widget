// AI 비서: API 키 없이, 구독 계정으로 로그인된 공식 CLI 를 대화 전용 모드로 호출한다.
//  - ChatGPT: 위젯 전용 Codex CLI (고정 버전 @openai/codex, 위젯 전용 CODEX_HOME, ChatGPT 로그인만 허용)
//  - Claude : Claude Code CLI (claude.ai 구독 로그인만 허용)
// 참고: codex-chatgpt-login-integration.md (MUST / MUST NOT 규칙)
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const APP_DIR = path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'Yusk Widget');
const CODEX_HOME = path.join(APP_DIR, 'codex-home');
const PINNED_CODEX_VERSION = '0.158.0';

const LIMITS = {
  stdin: 512 * 1024,
  stdout: { codex: 1024 * 1024, claude: 4 * 1024 * 1024 },
  statusOutput: 8 * 1024,
  timeoutMs: 180e3,
  loginTimeoutMs: 10 * 60e3,
  killGraceMs: 5e3,
};

// 사용자에게는 단계별 고정 문구만 보여 준다 (CLI 원본 출력은 노출하지 않는다)
const MESSAGES = {
  RUNTIME_CODEX: 'ChatGPT 실행 도구가 없거나 버전이 맞지 않아요. 위젯 폴더에서 npm install 을 다시 실행해 주세요.',
  RUNTIME_CLAUDE: 'Claude Code 가 설치되어 있지 않아요. (claude.com/claude-code)',
  LOGIN_NONE: '로그인이 필요해요. 설정 → AI 비서에서 로그인해 주세요.',
  LOGIN_API_KEY: 'API 키 로그인이 감지되었어요. 구독 계정으로 다시 로그인해 주세요.',
  LOGIN_UNKNOWN: '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
  MODEL: '이 계정에서 쓸 수 없는 모델이에요. 다른 모델을 골라 주세요.',
  SPAWN_FAILED: 'AI 도구를 실행하지 못했어요.',
  PROCESS_NONZERO: '요청이 실패했어요. 플랜 사용 한도에 도달했을 수도 있어요. 잠시 후 다시 시도해 주세요.',
  RATE_LIMIT: '플랜 사용 한도에 도달했어요. 한도가 풀린 뒤 다시 시도하거나 다른 모델을 골라 주세요.',
  STDOUT_EMPTY: '답변을 받지 못했어요. 다시 시도해 주세요.',
  TIMEOUT: '응답 시간이 너무 오래 걸려서 중단했어요.',
  TOO_LARGE: '질문이나 답변이 너무 길어요. 새 대화로 다시 시도해 주세요.',
};

// ───────────────────────── 환경변수 ─────────────────────────

// 이 값들이 자식 프로세스에 남아 있으면 구독 대신 API 과금 모드로 바뀔 수 있다
const SECRET_ENV = new Set([
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'KMA_SERVICE_KEY',
]);

const BASE_ALLOW = ['appdata', 'comspec', 'http_proxy', 'https_proxy', 'no_proxy', 'lang', 'lc_all', 'localappdata',
  'path', 'pathext', 'programdata', 'ssl_cert_file', 'systemdrive', 'systemroot', 'temp', 'tmp', 'tz', 'windir'];
const EXEC_ALLOW = {
  codex: new Set([...BASE_ALLOW, 'codex_ca_certificate']),
  // Claude Code 는 사용자 폴더의 로그인 정보(~/.claude)를 읽어야 한다
  claude: new Set([...BASE_ALLOW, 'userprofile', 'homedrive', 'homepath', 'username', 'claude_config_dir', 'node_extra_ca_certs']),
};

function withoutSecrets() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (SECRET_ENV.has(k.toUpperCase())) delete env[k];
  return env;
}

function codexHomeEnv(env) {
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  env.CODEX_HOME = CODEX_HOME;
  env.ELECTRON_RUN_AS_NODE = '1'; // Electron 에 들어 있는 고정 버전 Node 로 codex.js 를 실행
  return env;
}

function loginEnv(provider) {
  const env = withoutSecrets();
  return provider === 'codex' ? codexHomeEnv(env) : env;
}

function execEnv(provider) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && EXEC_ALLOW[provider].has(k.toLowerCase())) env[k] = v;
  }
  env.NO_COLOR = '1';
  return provider === 'codex' ? codexHomeEnv(env) : env;
}

// ───────────────────────── 런타임 ─────────────────────────

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

// 위젯 전용 Codex: node_modules 의 고정 버전만 허용한다
function codexRuntime() {
  // 설치판에서는 실행 파일을 asar 밖(app.asar.unpacked)에 풀어 둔다
  const root = path.resolve(__dirname, '..', 'node_modules').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const pkgDir = path.join(root, '@openai', 'codex');
  const codexJs = path.join(pkgDir, 'bin', 'codex.js');
  try {
    const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
    if (version !== PINNED_CODEX_VERSION) return null;
    const real = fs.realpathSync(codexJs);
    if (!isInside(real, fs.realpathSync(root))) return null;
    return { command: process.execPath, prefix: [real], version };
  } catch {
    return null;
  }
}

function claudeRuntime() {
  const candidates = [
    ...(process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, 'claude.exe')),
    path.join(HOME, '.local', 'bin', 'claude.exe'),
  ];
  const bin = candidates.find((p) => p && fs.existsSync(p));
  return bin ? { command: bin, prefix: [] } : null;
}

const runtime = (provider) => (provider === 'codex' ? codexRuntime() : claudeRuntime());

// ───────────────────────── 프로세스 실행 공통 ─────────────────────────

function killTree(p) {
  if (!p || p.exitCode !== null || p.signalCode !== null) return;
  execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {});
}

// 짧은 명령 (login status 등): 출력 상한 + timeout, 초과/오류는 null
function runSmall(rt, args, env, timeoutMs = 15e3) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    let p;
    try {
      p = spawn(rt.command, [...rt.prefix, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch {
      return resolve(null);
    }
    const t = setTimeout(() => { killTree(p); finish(null); }, timeoutMs);
    const onData = (d) => {
      out += d;
      if (out.length > LIMITS.statusOutput) { killTree(p); finish(null); }
    };
    p.stdout.setEncoding('utf8').on('data', onData);
    p.stderr.setEncoding('utf8').on('data', onData);
    p.on('error', () => finish(null));
    p.on('close', (code) => finish({ code, out }));
  });
}

// ───────────────────────── 로그인 상태 ─────────────────────────

// 반환: 'ok' | 'api-key' | 'none' | 'unknown'  (ok 만 통과, 나머지는 모두 차단 = fail closed)
function parseCodexStatus(r) {
  if (!r) return 'unknown';
  const lines = r.out.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
  if (r.code === 0 && lines.includes('Logged in using ChatGPT')) return 'ok';
  if (lines.some((l) => /logged in using (?:an )?api key/i.test(l))) return 'api-key';
  if (lines.some((l) => /^not logged in$/i.test(l))) return 'none';
  return 'unknown';
}

function parseClaudeStatus(r) {
  if (!r) return { mode: 'unknown' };
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1));
    if (!j.loggedIn) return { mode: 'none' };
    if (j.authMethod !== 'claude.ai') return { mode: 'api-key' };
    return { mode: 'ok', account: [j.email, j.subscriptionType && `${j.subscriptionType} 요금제`].filter(Boolean).join(' · ') };
  } catch {
    return { mode: 'unknown' };
  }
}

async function checkLogin(provider) {
  const rt = runtime(provider);
  if (!rt) return { mode: 'runtime' };
  if (provider === 'codex') {
    return { mode: parseCodexStatus(await runSmall(rt, ['login', 'status'], loginEnv('codex'))), account: 'ChatGPT 계정 (위젯 전용 로그인)' };
  }
  return parseClaudeStatus(await runSmall(rt, ['auth', 'status'], loginEnv('claude')));
}

// ───────────────────────── 모델 목록 ─────────────────────────

const CLAUDE_MODELS = [
  { id: 'opus', label: 'Claude Opus' },
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'haiku', label: 'Claude Haiku' },
];

function readModelsCache(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = (j.models || j.data || []).filter((m) => m.slug && m.visibility !== 'hide');
    return list.length ? list.map((m) => ({ id: m.slug, label: m.display_name || m.slug })) : null;
  } catch {
    return null;
  }
}

// 위젯 전용 CODEX_HOME 의 모델 목록 → (없으면) Codex 앱의 목록 → 기본값
function codexModels() {
  return readModelsCache(path.join(CODEX_HOME, 'models_cache.json'))
    || readModelsCache(path.join(HOME, '.codex', 'models_cache.json'))
    || [{ id: 'gpt-5.5', label: 'GPT-5.5' }];
}

// ───────────────────────── 상태 / 로그인 / 로그아웃 ─────────────────────────

const LOGIN_TEXT = {
  ok: null, none: '로그인이 필요해요', 'api-key': 'API 키 로그인이 감지되었어요. 다시 로그인해 주세요', unknown: '로그인 상태를 확인하지 못했어요',
};

async function status() {
  const [c, x] = await Promise.all([checkLogin('claude'), checkLogin('codex')]);
  const view = (s, models, extra) => ({
    installed: s.mode !== 'runtime',
    loggedIn: s.mode === 'ok',
    mode: s.mode,
    account: s.mode === 'ok' ? s.account : LOGIN_TEXT[s.mode] || '',
    models,
    ...extra,
  });
  const codexList = codexModels();
  return {
    claude: view(c, CLAUDE_MODELS, { shared: true }),
    codex: view(x, codexList, { defaultModel: codexList[0].id, version: PINNED_CODEX_VERSION, loggingIn: !!codexLoginJob }),
  };
}

let codexLoginJob = null;

// Codex: 숨김 프로세스로 `codex login` 실행 → 브라우저 OAuth. 동시에 1개만, 끝나면 상태를 다시 확인한다.
function loginCodex() {
  if (codexLoginJob) return codexLoginJob;
  const rt = codexRuntime();
  if (!rt) return Promise.resolve({ ok: false, error: MESSAGES.RUNTIME_CODEX });
  codexLoginJob = new Promise((resolve) => {
    const p = spawn(rt.command, [...rt.prefix, 'login'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], env: loginEnv('codex') });
    const t = setTimeout(() => killTree(p), LIMITS.loginTimeoutMs);
    const done = async () => {
      clearTimeout(t);
      const mode = (await checkLogin('codex')).mode;
      resolve(mode === 'ok' ? { ok: true } : { ok: false, error: mode === 'api-key' ? MESSAGES.LOGIN_API_KEY : '로그인을 완료하지 못했어요.' });
    };
    p.on('error', done);
    p.on('close', done);
  }).finally(() => { codexLoginJob = null; });
  return codexLoginJob;
}

// Claude: Claude Code 의 로그인 절차는 코드 붙여넣기가 필요할 수 있어 보이는 콘솔 창으로 띄운다.
function loginClaude() {
  const rt = claudeRuntime();
  if (!rt) return { ok: false, error: MESSAGES.RUNTIME_CLAUDE };
  spawn('cmd.exe', ['/c', 'start', '"Claude 로그인"', `"${rt.command}"`, 'auth', 'login'], {
    detached: true, windowsVerbatimArguments: true, stdio: 'ignore', env: loginEnv('claude'),
  }).unref();
  return { ok: true, pending: true };
}

function login(provider) {
  return provider === 'codex' ? loginCodex() : loginClaude();
}

// 위젯 전용 CODEX_HOME 만 로그아웃한다 (Codex 앱 로그인에는 영향 없음)
async function logout(provider) {
  if (provider !== 'codex') return { ok: false };
  const rt = codexRuntime();
  if (!rt) return { ok: false, error: MESSAGES.RUNTIME_CODEX };
  await runSmall(rt, ['logout'], loginEnv('codex'));
  return { ok: true };
}

// ───────────────────────── 대화 ─────────────────────────

let history = []; // { role: 'user' | 'assistant', text, at }
let current = null; // { proc, abort() }
let persist = null; // { load(): [], save(list) } — main.js 가 파일 저장을 연결한다

const HISTORY_MAX = 40;               // 저장·표시하는 메시지 수
const CONTEXT_WINDOW_MS = 12 * 3600e3; // 프롬프트에 넣는 이전 대화는 최근 12시간만

function setPersistence(p) {
  persist = p;
  try {
    const list = p.load();
    history = Array.isArray(list) ? list.filter((h) => h && typeof h.text === 'string' && ['user', 'assistant'].includes(h.role)).slice(-HISTORY_MAX) : [];
  } catch {
    history = [];
  }
}

function saveHistory() {
  history = history.slice(-HISTORY_MAX);
  try { persist?.save(history); } catch { /* 저장 실패는 대화를 막지 않는다 */ }
}

const getHistory = () => history;

const BASE_INSTRUCTIONS = [
  '당신은 사용자의 Windows 바탕화면 위젯에 들어 있는 개인 비서입니다.',
  '위젯 창이 작으므로 짧고 핵심만 한국어로 답하세요. 목록이 필요하면 짧은 불릿을 쓰세요.',
  '파일을 읽거나 명령을 실행하지 말고 대화로만 답하세요.',
].join('\n');

// 설정 → AI 비서의 성격·지침. 매 대화에 자동으로 붙는다.
const PERSONA_LIMIT = 2000;
const PRESETS = {
  pro: [
    '당신은 사용자를 보좌하는 유능한 전문 비서입니다.',
    '- 정중한 존댓말을 쓰되, 인사말이나 군더더기 없이 결론부터 말합니다.',
    '- 일정·마감·우선순위를 먼저 챙기고, 필요하면 바로 할 수 있는 다음 행동을 하나 제안합니다.',
    '- 확실하지 않은 내용은 추측하지 않고 확인이 필요하다고 분명히 말합니다.',
    '- 업무 문서나 메시지 초안을 부탁받으면 바로 쓸 수 있는 완성된 문장으로 작성합니다.',
  ].join('\n'),
  friendly: [
    '당신은 사용자와 가까운 친근한 비서입니다.',
    '- 편안하고 따뜻한 말투(부드러운 존댓말)로 이야기합니다.',
    '- 사용자의 컨디션과 일정을 함께 신경 써 주고, 가끔 짧은 격려를 덧붙입니다.',
  ].join('\n'),
  concise: [
    '당신은 극도로 간결한 비서입니다.',
    '- 가능한 한 한두 문장, 또는 짧은 불릿으로만 답합니다.',
    '- 설명·인사·맺음말을 생략하고 요청한 정보만 줍니다.',
  ].join('\n'),
};

// 성격·지침과 별개로 얹는 말투 (내용과 역할은 바꾸지 않는다)
const CAT_TONE = [
  '말투만 고양이처럼 합니다. 성격·역할·답변 내용과 형식은 위 설정을 그대로 따릅니다.',
  '- 말끝에 "~냥", "~다냥", "~냐옹"을 자연스럽게 섞습니다. 모든 문장에 붙이지 말고 읽기 편한 정도로만 씁니다.',
  '- 사용자가 부탁한 메일·문서·메시지 초안의 본문에는 고양이 말투를 넣지 않습니다.',
].join('\n');

// 뭉치가 일정·할 일 등록을 "제안"하는 형식. 위젯이 카드로 보여 주고, 사용자가 버튼을 눌러야 실제로 반영된다.
const ACTIONS = [
  '사용자가 일정 등록, 할 일 추가, 메모 저장을 부탁하면, 답변 맨 끝에 아래 형식의 블록을 붙이세요 (여러 건이면 블록도 여러 개).',
  '```mungchi-action',
  '{"type":"event","title":"치과","date":"2026-09-30","allDay":false,"start":"15:00","end":"16:00","location":""}',
  '```',
  '```mungchi-action',
  '{"type":"todo","text":"보고서 제출","date":"2026-10-02"}',
  '```',
  '```mungchi-action',
  '{"type":"memo","title":"회의 메모","body":"- 결정: ...\\n- 할 일: ..."}',
  '```',
  '- 사용자가 "메모해 줘", "적어 둬"처럼 기록을 부탁하면 memo 블록을 씁니다. 줄바꿈은 \\n 으로 넣습니다.',
  '- 이미 있는 일정·할 일을 바꾸거나 지우거나 완료할 때는 [사용자의 현재 상황]에 적힌 [id:...] 값을 그대로 씁니다:',
  '  {"type":"event_update","id":"<일정 id>", 바꿀 키만: "title","date","allDay","start","end","location"}',
  '  {"type":"event_delete","id":"<일정 id>"}',
  '  {"type":"todo_done","id":"<할 일 id>"}  {"type":"todo_update","id":"<할 일 id>","text":"...","date":"YYYY-MM-DD 또는 null"}  {"type":"todo_delete","id":"<할 일 id>"}',
  '- id 가 없는 일정(공휴일, 초대받은 일정 등)은 바꿀 수 없다고 안내하고 블록을 쓰지 마세요. 대상이 여러 개라 헷갈리면 먼저 되물으세요.',
  '- 날짜는 [사용자의 현재 상황]의 현재 시각을 기준으로 계산합니다. 형식: date "YYYY-MM-DD", start/end "HH:MM"(24시간).',
  '- 시간이 없으면 allDay 를 true 로 하고 start/end 는 빼세요. 끝 시간을 말하지 않았으면 시작 + 1시간입니다.',
  '- 할 일에 기한이 없으면 date 를 null 로 하세요.',
  '- 무엇을 등록할지 알 수 없을 만큼 정보가 부족할 때만 블록 없이 되물으세요.',
  '- 블록을 붙였다면 아직 반영된 것이 아닙니다. "등록했다/완료했다/옮겼다"처럼 단정하지 말고, 무엇을 준비했는지 한 문장으로 요약한 뒤 "카드의 버튼을 누르면 반영된다"고 안내하세요.',
  '- 블록 안 JSON 은 위 예시와 같은 키만 쓰고, 블록 밖에는 JSON 을 쓰지 마세요.',
].join('\n');

const clip = (s) => String(s || '').trim().slice(0, PERSONA_LIMIT);

function systemText(persona = {}) {
  const parts = [BASE_INSTRUCTIONS];
  const name = clip(persona.name).slice(0, 20);
  if (name) parts.push('', `[당신의 이름] ${name} — 사용자가 이 이름으로 부르면 자신을 가리키는 것입니다.`);
  const style = clip(persona.persona) || PRESETS[persona.personaPreset] || PRESETS.pro;
  parts.push('', '[비서의 성격과 말투]', style);
  if (clip(persona.about)) parts.push('', '[사용자에 대해]', clip(persona.about));
  if (clip(persona.rules)) parts.push('', '[항상 지킬 지침]', clip(persona.rules));
  if (persona.catTone) parts.push('', '[말투]', CAT_TONE);
  parts.push('', '[일정·할 일 등록]', ACTIONS);
  return parts.join('\n');
}

function buildPrompt(text, context, system) {
  const parts = [];
  if (system) parts.push(system, '');
  parts.push('[사용자의 현재 상황 — 질문과 관련 있을 때만 활용]', context, '');
  const recent = history.filter((h) => Date.now() - (h.at || 0) < CONTEXT_WINDOW_MS).slice(-12);
  if (recent.length) {
    parts.push('[이전 대화]');
    for (const h of recent) parts.push(`${h.role === 'user' ? '사용자' : '비서'}: ${h.text}`);
    parts.push('');
  }
  parts.push('[이번 질문]', text);
  return parts.join('\n');
}

// 시스템 프롬프트는 argv 대신 작업 폴더의 파일로 넘긴다 (프로세스 목록에 내용이 드러나지 않게)
function claudeArgs(model, effort, webSearch, systemFile) {
  const args = ['-p', '--model', model, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--system-prompt-file', systemFile, '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence'];
  if (webSearch) args.push('--tools', 'WebSearch', '--allowedTools', 'WebSearch');
  else args.push('--tools', '');
  if (model !== 'haiku') args.push('--effort', effort);
  return args;
}

function codexArgs(model, effort, webSearch, workDir) {
  const args = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only',
    '--skip-git-repo-check', '--color', 'never', '--cd', workDir, '--model', model,
    '-c', 'approval_policy="never"', '-c', `model_reasoning_effort="${effort}"`];
  if (webSearch) args.push('-c', 'web_search="live"');
  args.push('-');
  return args;
}

// 스트림 이벤트 해석기: 텍스트 조각은 onDelta, 진행 상태는 onStatus, 실패 분류는 반환값
function makeParser(provider, onDelta, onStatus) {
  const st = { answer: '', failure: null };
  const add = (t) => { st.answer += t; onDelta(t); };
  st.handle = (ev) => {
    if (provider === 'claude') {
      const e = ev.event;
      if (ev.type === 'stream_event' && e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') add(e.delta.text);
      else if (ev.type === 'stream_event' && e?.type === 'content_block_start') {
        if (['server_tool_use', 'tool_use'].includes(e.content_block?.type)) onStatus('웹 검색 중…');
        else if (e.content_block?.type === 'text' && st.answer) add('\n\n');
      } else if (ev.type === 'rate_limit_event' && ev.rate_limit_info?.status === 'rejected') st.failure = 'RATE_LIMIT';
      else if (ev.type === 'result' && ev.is_error) {
        const s = `${ev.subtype || ''} ${ev.api_error_status || ''} ${typeof ev.result === 'string' ? ev.result : ''}`;
        st.failure = /rate.?limit|usage limit|429/i.test(s) ? 'RATE_LIMIT'
          : /auth|login|401/i.test(s) ? 'LOGIN_NONE'
            : /model/i.test(s) && /not|invalid|unsupported/i.test(s) ? 'MODEL' : 'PROCESS_NONZERO';
      }
    } else {
      const item = ev.item;
      if ((ev.type === 'item.started' || ev.type === 'item.updated') && item?.type === 'web_search') onStatus('웹 검색 중…');
      else if (ev.type === 'item.completed' && item?.type === 'agent_message' && item.text) add((st.answer ? '\n\n' : '') + item.text);
      else if (ev.type === 'error' || ev.type === 'turn.failed') {
        const s = `${ev.message || ''} ${ev.error?.message || ''}`;
        st.failure = /usage limit|rate.?limit|quota|429/i.test(s) ? 'RATE_LIMIT'
          : /model/i.test(s) && /not|invalid|unsupported|exist/i.test(s) ? 'MODEL' : 'PROCESS_NONZERO';
      }
    }
  };
  return st;
}

// 1회 실행. 결과: { stage: 'COMPLETE' | 오류 stage, answer }
function runOnce(provider, rt, args, prompt, deadline, onDelta, onStatus, workDir) {
  return new Promise((resolve) => {
    const parser = makeParser(provider, onDelta, onStatus);
    let stage = null;
    let buf = '';
    let outBytes = 0;
    let closed = false;
    let proc;
    try {
      proc = spawn(rt.command, [...rt.prefix, ...args], {
        cwd: workDir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: execEnv(provider),
      });
    } catch {
      return resolve({ stage: 'SPAWN_FAILED', answer: '' });
    }

    let graceTimer = null;
    const stop = (s) => {
      if (!stage) stage = s;
      killTree(proc);
      // kill 후 grace 동안 close 를 기다리고, 끝내 안 닫히면 폴더 정리를 건너뛰도록 알린다
      graceTimer ||= setTimeout(() => { if (!closed) resolve({ stage, answer: parser.answer, stuck: true }); }, LIMITS.killGraceMs);
    };
    current = { proc, abort: () => stop('ABORTED') };

    const timer = setTimeout(() => stop('TIMEOUT'), Math.max(1000, deadline - Date.now()));

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      outBytes += Buffer.byteLength(d);
      if (outBytes > LIMITS.stdout[provider]) return stop('TOO_LARGE');
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try { parser.handle(JSON.parse(line)); } catch { /* 형식이 다른 줄은 무시 */ }
      }
    });
    // stderr 는 반드시 읽어서 버린다 (Codex 는 stderr 에 프롬프트를 에코하므로 저장·표시 금지)
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', () => {});

    proc.on('error', () => { if (!stage) stage = 'SPAWN_FAILED'; });
    proc.on('close', (code) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      if (!stage) {
        if (parser.failure) stage = parser.failure;
        else if (code !== 0) stage = 'PROCESS_NONZERO';
        else if (!parser.answer.trim()) stage = 'STDOUT_EMPTY';
        else stage = 'COMPLETE';
      }
      resolve({ stage, answer: parser.answer });
    });

    proc.stdin.end(prompt, 'utf8');
  });
}

function makeWorkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yusk-ai-'));
}

function removeWorkDir(dir) {
  try {
    if (isInside(path.resolve(dir), path.resolve(os.tmpdir()))) fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* 정리 실패가 결과를 덮지 않게 한다 */ }
}

const RETRYABLE = new Set(['PROCESS_NONZERO', 'STDOUT_EMPTY']);

async function chat({ provider, model, effort, webSearch, persona, text, context }, onDelta, onStatus) {
  const rt = runtime(provider);
  if (!rt) return { ok: false, stage: 'RUNTIME', error: provider === 'codex' ? MESSAGES.RUNTIME_CODEX : MESSAGES.RUNTIME_CLAUDE };

  // 호출 직전마다 구독 로그인인지 확인 (아니면 실행하지 않는다)
  onStatus('연결 확인 중…');
  const login = await checkLogin(provider);
  if (login.mode !== 'ok') {
    const key = { none: 'LOGIN_NONE', 'api-key': 'LOGIN_API_KEY' }[login.mode] || 'LOGIN_UNKNOWN';
    return { ok: false, stage: 'LOGIN', error: MESSAGES[key] };
  }
  if (provider === 'codex' && !model) model = codexModels()[0].id;
  if (provider === 'codex' && !codexModels().some((m) => m.id === model)) return { ok: false, stage: 'MODEL', error: MESSAGES.MODEL };

  const system = systemText(persona);
  // Codex 는 시스템 프롬프트 옵션이 없어 stdin 프롬프트 맨 앞에 넣는다
  const prompt = buildPrompt(text, context, provider === 'codex' ? system : null);
  if (Buffer.byteLength(prompt) > LIMITS.stdin) return { ok: false, stage: 'TOO_LARGE', error: MESSAGES.TOO_LARGE };

  onStatus('생각하는 중…');
  const deadline = Date.now() + LIMITS.timeoutMs; // 재시도는 남은 시간만 쓴다
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    const workDir = makeWorkDir();
    let args;
    if (provider === 'codex') {
      args = codexArgs(model, effort, webSearch, workDir);
    } else {
      const systemFile = path.join(workDir, 'system.txt');
      fs.writeFileSync(systemFile, system, 'utf8');
      args = claudeArgs(model, effort, webSearch, systemFile);
    }
    result = await runOnce(provider, rt, args, prompt, deadline, onDelta, onStatus, workDir);
    if (!result.stuck) removeWorkDir(workDir);
    // 이미 화면에 글자가 나간 뒤에는 재시도하지 않는다
    if (!RETRYABLE.has(result.stage) || result.answer || Date.now() > deadline - 5e3) break;
  }
  current = null;

  if (result.stage === 'ABORTED') return { ok: false, aborted: true };
  if (result.stage !== 'COMPLETE') return { ok: false, stage: result.stage, error: MESSAGES[result.stage] || MESSAGES.PROCESS_NONZERO };
  const at = Date.now();
  history.push({ role: 'user', text, at }, { role: 'assistant', text: result.answer, at });
  saveHistory();
  return { ok: true };
}

function abort() {
  current?.abort();
}

function reset() {
  abort();
  history = [];
  saveHistory();
}

module.exports = {
  status, login, logout, chat, abort, reset, setPersistence, getHistory,
  // 테스트용
  PRESETS,
  _internal: { buildPrompt, systemText, parseCodexStatus, parseClaudeStatus, execEnv, loginEnv, codexArgs, claudeArgs, codexRuntime, CODEX_HOME },
};

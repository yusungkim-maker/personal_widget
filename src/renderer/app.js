const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const ACCENTS = ['#8ab4ff', '#b79cff', '#7fd6b5', '#ffb07a', '#ff8fb1', '#f5d76e'];

let config = null;

// ───────────────────────── 공통 ─────────────────────────

function applyAppearance() {
  const a = config.appearance;
  document.documentElement.dataset.theme = a.theme;
  document.documentElement.style.setProperty('--accent', a.accent);
  document.documentElement.style.setProperty('--glass', a.glass);
  document.body.classList.toggle('locked', config.window.locked);

  const s = config.sections;
  $('#sec-weather').hidden = !s.weather;
  $('#sec-calendar').hidden = !s.calendar;
  $('#sec-todo').hidden = !s.todo;
  $('#sec-ai').hidden = !s.ai;
  $('#sec-memo').hidden = s.memo === false;
  renderModeButton();
}

async function patchConfig(patch) {
  config = await widget.updateConfig(patch);
  applyAppearance();
  return config;
}

// 창 높이를 내용에 맞춘다
new ResizeObserver(() => widget.reportHeight(Math.ceil($('#app').getBoundingClientRect().height))).observe($('#app'));

// ───────────────────────── 시계 ─────────────────────────

function greeting(h) {
  if (h < 5) return '늦은 밤이에요';
  if (h < 11) return '좋은 아침이에요';
  if (h < 14) return '맛있는 점심 드세요';
  if (h < 18) return '오후도 힘내요';
  if (h < 22) return '편안한 저녁 보내세요';
  return '오늘도 수고했어요';
}

function tickClock() {
  const now = new Date();
  const { clock24h, showSeconds } = config.appearance;
  let h = now.getHours();
  let ampm = '';
  if (!clock24h) {
    ampm = h < 12 ? '오전' : '오후';
    h = h % 12 || 12;
  }
  $('#time').textContent = `${clock24h ? pad(h) : h}:${pad(now.getMinutes())}`;
  $('#ampm').textContent = ampm;
  $('#secs').textContent = showSeconds ? pad(now.getSeconds()) : '';
  $('#date').textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일`;
  $('#greeting').textContent = greeting(now.getHours());

  // 날짜가 바뀌면 달력도 갱신
  const today = ymd(now);
  if (cal.today !== today) {
    cal.today = today;
    if (!cal.userMoved) cal.view = new Date(now.getFullYear(), now.getMonth(), 1);
    cal.selected = today;
    renderCalendar();
  }
}

const MODE_ICONS = {
  desktop: { title: '바탕화면에 고정됨', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>' },
  normal: { title: '일반 창', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/></svg>' },
  top: { title: '항상 위에 표시', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>' },
};

function renderModeButton() {
  const m = MODE_ICONS[config.window.mode] || MODE_ICONS.normal;
  const b = $('#btn-mode');
  b.innerHTML = m.svg;
  b.title = `${m.title} (클릭해서 변경)`;
  b.classList.toggle('accent', config.window.mode === 'top');
}

$('#btn-mode').addEventListener('click', () => {
  const order = ['desktop', 'normal', 'top'];
  const next = order[(order.indexOf(config.window.mode) + 1) % order.length];
  patchConfig({ window: { mode: next } });
});

// ───────────────────────── 날씨 ─────────────────────────

let weatherData = [];

function fmtT(v) {
  return Number.isFinite(v) ? `${Math.round(v)}°` : '-';
}

function renderWeather() {
  const list = $('#w-list');
  if (!config.weather.hasKey) {
    list.innerHTML = `<div class="w-error">기상청 인증키가 필요해요. <button class="link" data-open-settings>설정 열기</button></div>`;
    $('#w-hourly').innerHTML = '';
    return;
  }
  if (!weatherData.length) {
    list.innerHTML = '<div class="w-error">날씨를 불러오는 중…</div>';
    return;
  }
  list.innerHTML = weatherData.map((p) => {
    if (!p.ok) return `<div class="w-row"><div></div><div><div class="w-name">${esc(p.name)}</div><div class="w-desc">${esc(p.error)}</div></div><div></div></div>`;
    const c = p.data.current;
    const t = p.data.daily[0] || {};
    return `<div class="w-row" title="바람 ${c.wind}m/s · 1시간 강수 ${c.rain1h}mm">
      ${weatherIcon(c.icon, 40)}
      <div>
        <div class="w-name">${esc(p.name)}</div>
        <div class="w-desc">${esc(c.desc)} · 습도 ${c.humidity}%</div>
        <div class="w-dust" data-dust-row="${esc(p.name)}"></div>
      </div>
      <div class="w-right">
        <div class="w-temp">${fmtT(c.temp)}</div>
        <div class="w-mm"><span class="hi">${fmtT(t.max)}</span> / <span class="lo">${fmtT(t.min)}</span><span class="pop">☂${t.pop ?? 0}%</span></div>
      </div>
    </div>`;
  }).join('');

  // 첫 번째 지역의 시간별 예보
  const first = weatherData.find((p) => p.ok);
  $('#w-hourly').innerHTML = first ? first.data.hourly.slice(0, 12).map((h) => `
    <div class="h-item">
      <span class="${h.hour === 0 ? 'h-day' : 'muted'}">${h.hour === 0 ? '내일' : `${h.hour}시`}</span>
      ${weatherIcon(h.icon, 24)}
      <span class="h-t">${h.temp}°</span>
      <span class="h-p">${h.pop >= 30 ? `${h.pop}%` : ''}</span>
    </div>`).join('') : '';

  const at = first ? new Date(first.data.updatedAt) : null;
  $('#w-updated').textContent = at ? `기상청 단기예보 · ${pad(at.getHours())}:${pad(at.getMinutes())} 갱신` : '';
}

async function loadWeather(force = false) {
  if (!config.sections.weather || !config.weather.hasKey) return renderWeather();
  renderWeather();
  try {
    weatherData = await widget.weatherLocations(force);
    loadAir();
  } catch (e) {
    weatherData = config.weather.locations.map((l) => ({ ...l, ok: false, error: e.message }));
  }
  renderWeather();
}

$('#w-refresh').addEventListener('click', () => loadWeather(true));
$('#btn-nation').addEventListener('click', () => widget.openNationwide());

// ───────────────────────── 달력 ─────────────────────────

const cal = {
  today: null,
  view: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: ymd(new Date()),
  userMoved: false,
  events: [],
  pending: [],        // 구글에 보내는 중이거나 실패한 일정 (낙관적 표시)
  hidden: new Set(),  // 삭제·수정 중이라 잠시 숨긴 구글 일정 id
  loadedRange: null,
  errors: [],
  googleConnected: false,
};

function gridRange(view) {
  const start = new Date(view.getFullYear(), view.getMonth(), 1 - view.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41, 23, 59, 59);
  return { start, end };
}

function allEvents() {
  return [...cal.events.filter((e) => !cal.hidden.has(e.gid)), ...cal.pending]
    .sort((x, y) => (x.allDay === y.allDay ? x.start.localeCompare(y.start) : x.allDay ? -1 : 1));
}

function eventsOn(day) {
  return allEvents().filter((e) => e.startDay <= day && e.endDay >= day);
}

function todosOn(day) {
  return config.todos.filter((t) => t.date === day);
}

function renderCalendar() {
  const v = cal.view;
  $('#cal-title').textContent = `${v.getFullYear()}년 ${v.getMonth() + 1}월`;
  const { start } = gridRange(v);
  const today = ymd(new Date());
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d);
    const evs = eventsOn(key);
    const holiday = evs.some((e) => e.holiday);
    const cls = ['cal-day',
      d.getMonth() !== v.getMonth() && 'out',
      d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat',
      holiday && 'holiday', key === today && 'today', key === cal.selected && 'selected'].filter(Boolean).join(' ');
    const todoDot = todosOn(key).some((t) => !t.done) ? '<i class="t"></i>' : '';
    const dots = evs.slice(0, todoDot ? 2 : 3).map((e) => `<i class="${e.holiday ? 'h' : e.flex ? 'f' : ''}"></i>`).join('') + todoDot;
    html += `<button class="${cls}" data-day="${key}"><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  $('#cal-grid').innerHTML = html;
  renderEvents();
}

const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// 시작–종료 시각. 여러 날에 걸친 일정은 그날 기준으로 "~18:00", "09:00~", "계속" 으로 표시한다
function fmtEventTime(e, day) {
  if (e.allDay) return '종일';
  const s = new Date(e.start), en = new Date(e.end);
  const starts = e.startDay === day, ends = e.endDay === day;
  if (starts && ends) return +s === +en ? hhmm(s) : `${hhmm(s)}–${hhmm(en)}`;
  if (starts) return `${hhmm(s)}~`;
  if (ends) return `~${hhmm(en)}`;
  return '계속';
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  const suffix = key === today ? ' · 오늘' : key === tomorrow ? ' · 내일' : '';
  return `${m}월 ${d}일 (${DOW[date.getDay()]})${suffix}`;
}

function renderEvents() {
  const box = $('#cal-events');
  const day = cal.selected;
  const list = eventsOn(day);
  const evClass = (e) => [e.holiday ? 'holiday' : e.flex ? 'flex' : '', e.gid && e.editable !== false ? 'editable' : '',
    e.pending ? 'pending' : '', e.failed ? 'failed' : ''].filter(Boolean).join(' ');
  const evState = (e) => (e.failed
    ? `<span class="ev-state err">실패 <button class="link" data-retry="${e.id}">다시 시도</button><button class="link" data-discard="${e.id}">취소</button></span>`
    : e.pending ? '<span class="ev-state">동기화 중…</span>' : '');
  const evHtml = (e, d) => `<div class="ev ${evClass(e)}" ${e.gid && !e.pending ? `data-gid="${esc(e.gid)}"` : ''}
      title="${esc(e.title)}${e.location ? ` · ${esc(e.location)}` : ''}${e.gid && !e.pending ? ' (눌러서 수정)' : ''}">
      <span class="bar"></span><span class="t">${fmtEventTime(e, d)}</span><span class="ti">${esc(e.title)}</span>${evState(e)}</div>`;

  const dayTodos = todosOn(day);
  let html = `<div class="ev-day">${dayLabel(day)}</div>`;
  html += list.length || dayTodos.length ? list.map((e) => evHtml(e, day)).join('') : '<div class="ev-empty">일정이 없어요 · 날짜를 두 번 누르면 바로 추가할 수 있어요</div>';
  html += dayTodos.map((t) => `<div class="ev todo-ev ${t.done ? 'done' : ''}" data-tid="${t.id}">
      <span class="bar"></span><span class="t"><button class="mini-chk" data-act="toggle" title="완료"></button>할 일</span><span class="ti">${esc(t.text)}</span></div>`).join('');

  // 오늘을 보고 있으면 앞으로 7일간의 일정도 보여 준다
  if (day === ymd(new Date())) {
    const until = ymd(new Date(Date.now() + 7 * 864e5));
    const upcoming = allEvents().filter((e) => e.startDay > day && e.startDay <= until && !e.holiday).slice(0, 5);
    if (upcoming.length) {
      html += '<div class="ev-day">다가오는 일정</div>';
      html += upcoming.map((e) => {
        const [, m, d] = e.startDay.split('-').map(Number);
        const t = e.allDay ? '' : ` ${fmtEventTime(e, e.startDay)}`;
        return `<div class="ev ${evClass(e)}" ${e.gid && !e.pending ? `data-gid="${esc(e.gid)}"` : ''}><span class="bar"></span><span class="t">${m}/${d}${t}</span><span class="ti">${esc(e.title)}</span>${evState(e)}</div>`;
      }).join('');
    }
  }
  const shown = cal.events.filter((e) => e.startDay.slice(0, 7) <= ymd(cal.view).slice(0, 7) && e.endDay.slice(0, 7) >= ymd(cal.view).slice(0, 7));
  const monthTodos = config.todos.some((t) => t.date && t.date.slice(0, 7) === ymd(cal.view).slice(0, 7));
  if (shown.some((e) => e.flex) || monthTodos) {
    html += `<div class="cal-legend"><span><i></i>일정</span>${shown.some((e) => e.flex) ? '<span><i class="f"></i>flex 휴가·근무</span>' : ''}${monthTodos ? '<span><i class="t"></i>할 일</span>' : ''}<span><i class="h"></i>공휴일</span></div>`;
  }
  if (!config.calendar.icalUrls.length && !cal.googleConnected) {
    html += '<div class="cal-note">구글 캘린더를 연결하면 일정이 여기에 표시돼요. <button class="link" data-open-settings>연결하기</button></div>';
  }
  if (cal.errors.length) html += `<div class="cal-note">${cal.errors.map(esc).join('<br>')}</div>`;
  box.innerHTML = html;
}

async function loadCalendar(force = false) {
  if (!config.sections.calendar) return;
  const { start, end } = gridRange(cal.view);
  // 다가오는 일정용으로 오늘부터 8일 뒤까지는 항상 포함
  const upto = new Date(Math.max(end.getTime(), Date.now() + 8 * 864e5));
  const from = new Date(Math.min(start.getTime(), new Date().setHours(0, 0, 0, 0)));
  const key = `${ymd(from)}_${ymd(upto)}`;
  if (!force && cal.loadedRange === key) return;
  try {
    const r = await widget.fetchCalendar(from.toISOString(), upto.toISOString());
    cal.events = r.events;
    cal.errors = r.errors;
    cal.googleConnected = !!r.googleConnected;
    cal.loadedRange = key;
  } catch (e) {
    cal.errors = [e.message];
  }
  renderCalendar();
}

function moveMonth(delta) {
  cal.view = new Date(cal.view.getFullYear(), cal.view.getMonth() + delta, 1);
  cal.userMoved = true;
  renderCalendar();
  loadCalendar();
}

$('#cal-prev').addEventListener('click', () => moveMonth(-1));
$('#cal-next').addEventListener('click', () => moveMonth(1));
$('#cal-today').addEventListener('click', () => {
  const n = new Date();
  cal.view = new Date(n.getFullYear(), n.getMonth(), 1);
  cal.selected = ymd(n);
  cal.userMoved = false;
  renderCalendar();
  loadCalendar();
});
$('#cal-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (!b) return;
  cal.selected = b.dataset.day;
  renderCalendar();
});

// ───────────────────────── 할 일 ─────────────────────────

// 날짜 배지: 오늘 / 내일 / 10/2 (금) / 지남
function todoBadge(t) {
  if (!t.date) return '';
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  const [y, m, d] = t.date.split('-').map(Number);
  const label = t.date === today ? '오늘' : t.date === tomorrow ? '내일' : `${m}/${d} (${DOW[new Date(y, m - 1, d).getDay()]})`;
  const cls = !t.done && t.date < today ? 'overdue' : t.date === today ? 'today' : '';
  return `<button class="due ${cls}" data-act="date" title="날짜 바꾸기">${!t.done && t.date < today ? '지남 · ' : ''}${label}</button>`;
}

function renderTodos() {
  const todos = config.todos;
  const left = todos.filter((t) => !t.done).length;
  $('#todo-count').textContent = todos.length ? left : '';
  $('#todo-clear').hidden = !todos.some((t) => t.done);
  // 안 끝난 것 먼저, 그 안에서 날짜 빠른 순 (날짜 없는 것은 뒤), 나머지는 입력 순서 유지
  const order = todos.map((t, i) => ({ t, i })).sort((a, b) =>
    (a.t.done - b.t.done) || ((a.t.date || '9999') < (b.t.date || '9999') ? -1 : (a.t.date || '9999') > (b.t.date || '9999') ? 1 : a.i - b.i));
  $('#todo-list').innerHTML = todos.length
    ? order.map(({ t }) => `<li class="todo ${t.done ? 'done' : ''}" data-id="${t.id}">
        <button class="chk" data-act="toggle" title="완료"></button>
        <span class="txt">${esc(t.text)}</span>
        ${todoBadge(t)}
        <button class="del" data-act="del" title="삭제">✕</button></li>`).join('')
    : '<li class="todo-empty">할 일이 없어요. 여유로운 하루!</li>';
}

function saveTodos(todos) {
  config.todos = todos;
  renderTodos();
  renderCalendar();
  widget.updateConfig({ todos });
}

function toggleTodo(id) {
  saveTodos(config.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
}

$('#todo-list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (!act || !id) return;
  if (act === 'toggle') toggleTodo(id);
  if (act === 'del') saveTodos(config.todos.filter((t) => t.id !== id));
  if (act === 'date') pickTodoDate(id, e.target.closest('[data-act]'));
});
$('#todo-clear').addEventListener('click', () => saveTodos(config.todos.filter((t) => !t.done)));

// ───────────────────────── AI 비서 ─────────────────────────

let streamingEl = null;
let streamingText = '';

// 아주 가벼운 마크다운 렌더링 (굵게, 코드, 불릿)
function md(text) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) {
      (list ||= []).push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}

function addMsg(cls, html) {
  $('#ai-log .ai-hello')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  if (cls.startsWith('bot')) {
    // 비서 메시지는 프로필 사진과 함께 한 줄로
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML = catAvatar(22);
    row.appendChild(el);
    $('#ai-log').appendChild(row);
  } else {
    $('#ai-log').appendChild(el);
  }
  $('#ai-log').scrollTop = $('#ai-log').scrollHeight;
  return el;
}

const aiName = () => (config.ai.name || '').trim() || '뭉치';

function renderAiProfile() {
  $('#ai-avatar').innerHTML = catAvatar(30);
  $('#ai-name').textContent = aiName();
  const log = $('#ai-log');
  if (!log.children.length || log.querySelector('.ai-hello')) {
    const hello = config.ai.catTone ? '오늘 일정이나 날씨, 뭐든 물어보라냥 🐾' : '오늘 일정이나 날씨, 무엇이든 물어보세요.';
    log.innerHTML = `<div class="ai-hello">${catAvatar(34)}<span>${esc(aiName())}예요. ${hello}</span></div>`;
  }
}

// API 키·토큰·OAuth 비밀값처럼 보이는 문자열은 AI 에 보내기 전에 가린다
const SECRET_PATTERNS = [
  // "client_secret: 값", "비밀번호=값" 처럼 이름표가 붙은 값은 이름표는 두고 값만 가린다
  [/((?:client[_ ]?secret|password|비밀번호|secret|token|api[_ ]?key|인증키)\s*[:=]\s*)\S+/gi, '$1[비밀값 숨김]'],
  [/GOCSPX-[\w-]+/g, '[비밀값 숨김]'],                                        // Google OAuth client secret
  [/\d{9,}-[a-z0-9]{16,}(?:\.apps\.googleusercontent\.com)?/gi, '[비밀값 숨김]'], // Google OAuth client id
  [/AIza[\w-]{30,}/g, '[비밀값 숨김]'],                                       // Google API key
  [/sk-(?:ant-)?[\w-]{16,}/g, '[비밀값 숨김]'],                               // Anthropic / OpenAI key
  [/gh[pousr]_[A-Za-z0-9]{30,}/g, '[비밀값 숨김]'],                           // GitHub token
  [/\b[a-f0-9]{40,}\b/gi, '[비밀값 숨김]'],                                   // 긴 16진수 키 (공공데이터포털 등)
];
function redactSecrets(s) {
  return SECRET_PATTERNS.reduce((acc, [re, to]) => acc.replace(re, to), String(s));
}

function aiContext() {
  const now = new Date();
  const lines = [`현재 시각: ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일 ${pad(now.getHours())}:${pad(now.getMinutes())}`];
  for (const p of weatherData.filter((x) => x.ok)) {
    const c = p.data.current;
    const d = p.data.daily.map((x) => `${x.date.slice(4, 6)}/${x.date.slice(6)} 최저 ${x.min}° 최고 ${x.max}° 강수확률 ${x.pop}%`).join(', ');
    lines.push(`날씨(${p.name}): 현재 ${c.temp}° ${c.desc}, 습도 ${c.humidity}% / ${d}`);
  }
  lines.push(...airContextLines());
  const today = ymd(now);
  const since = ymd(new Date(Date.now() - 3 * 864e5));
  const until = ymd(new Date(Date.now() + 14 * 864e5));
  const evs = allEvents().filter((e) => !e.pending && e.endDay >= since && e.startDay <= until);
  if (evs.length) {
    lines.push('일정 (최근 3일 ~ 앞으로 14일, [id:...] 가 있는 것만 수정·삭제 가능):');
    for (const e of evs.slice(0, 40)) {
      const id = e.gid && e.editable !== false ? `[id:${e.gid}] ` : '';
      lines.push(`- ${id}${e.startDay} ${e.allDay ? '종일' : fmtEventTime(e, e.startDay)} ${e.title}${e.location ? ` @${e.location}` : ''}${e.holiday ? ' (공휴일)' : e.flex ? ' (flex 휴가·근무)' : ''}`);
    }
  }
  const todos = config.todos.filter((t) => !t.done);
  if (todos.length) {
    lines.push('남은 할 일:');
    for (const t of todos.slice(0, 40)) lines.push(`- [id:${t.id}] ${t.text}${t.date ? ` (${t.date}까지)` : ''}`);
  }
  const recentMemos = config.ai.shareMemos === false ? [] : [...(config.memos || [])].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 5);
  if (recentMemos.length) {
    lines.push('최근 메모:');
    for (const m of recentMemos) lines.push(`- [${redactSecrets(m.title || '제목 없음')}] ${redactSecrets(String(m.body || '').replace(/\s+/g, ' ').slice(0, 200))}`);
  }
  lines.push(`구글 캘린더 쓰기 연결: ${typeof gcalState !== 'undefined' && gcalState.connected ? '됨' : '안 됨 (등록 카드를 누르면 입력 화면이 열림)'}`);
  return lines.join('\n');
}

widget.onChatStatus((s) => {
  if (streamingEl && !streamingText) streamingEl.innerHTML = `<span class="st">${esc(s)}</span>`;
});

widget.onChatDelta((d) => {
  if (!streamingEl) return;
  streamingText += d;
  // 등록 제안 블록은 글자로 보여 주지 않고, 답변이 끝나면 카드로 바꾼다
  streamingEl.innerHTML = md(stripActions(streamingText));
  $('#ai-log').scrollTop = $('#ai-log').scrollHeight;
});

async function sendChat() {
  const input = $('#ai-input');
  const text = input.value.trim();
  if (streamingEl) return widget.abortChat();
  if (!text) return;
  input.value = '';
  autoGrow();
  addMsg('user', esc(text));
  streamingText = '';
  streamingEl = addMsg('bot typing', '');
  $('#ai-send').textContent = '중지';

  const r = await widget.chat(text, aiContext());
  const el = streamingEl;
  streamingEl = null;
  el.classList.remove('typing');
  $('#ai-send').textContent = '전송';
  if (!r.ok) {
    if (r.aborted) {
      if (!streamingText) (el.closest('.msg-row') || el).remove();
    } else {
      el.classList.add('err');
      el.innerHTML = esc(r.error);
    }
  } else {
    el.innerHTML = md(stripActions(streamingText));
    renderActionCards(el, streamingText);
    if (r.truncated) el.insertAdjacentHTML('beforeend', '<p class="muted">(답변이 길어 중간에 끊겼어요)</p>');
  }
}

// 위젯을 다시 켜면 저장된 대화를 보여 준다. 지난 등록 카드는 중복 등록을 막기 위해 "지난 제안"으로만 표시.
async function restoreChat() {
  let list = [];
  try { list = await widget.chatHistory(); } catch { /* 없음 */ }
  if (!list.length) return;
  const log = $('#ai-log');
  log.innerHTML = '';
  const first = new Date(list[0].at || Date.now());
  const label = first.toDateString() === new Date().toDateString()
    ? `${first.getHours() < 12 ? '오전' : '오후'} ${first.getHours() % 12 || 12}:${pad(first.getMinutes())}`
    : `${first.getMonth() + 1}/${first.getDate()}`;
  log.insertAdjacentHTML('beforeend', `<div class="chat-divider"><span>지난 대화 · ${label}</span></div>`);
  for (const h of list) {
    if (h.role === 'user' && h.text.startsWith('[아침 브리핑]')) {
      log.insertAdjacentHTML('beforeend', '<div class="chat-divider brief"><span>☀️ 아침 브리핑</span></div>');
    } else if (h.role === 'user') addMsg('user', esc(h.text));
    else {
      const el = addMsg('bot', md(stripActions(h.text)));
      renderActionCards(el, h.text, { past: true });
    }
  }
  log.scrollTop = log.scrollHeight;
}

function autoGrow() {
  const t = $('#ai-input');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight + 2, 90)}px`;
}

$('#ai-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
$('#ai-input').addEventListener('input', autoGrow);
$('#ai-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendChat();
  }
});
$('#ai-reset').addEventListener('click', async () => {
  await widget.resetChat();
  streamingEl = null;
  $('#ai-send').textContent = '전송';
  $('#ai-log').innerHTML = '';
  renderAiProfile();
});

// ───────────────────────── 설정 ─────────────────────────

// ── AI 계정 (Claude Code / Codex 로그인) ──

let aiStatus = null;
let loginPoll = null;

const PROVIDERS = {
  claude: { name: 'Claude', logo: 'C', app: 'Claude Code', install: 'Claude Code 를 설치하면 로그인할 수 있어요 (claude.com/claude-code).' },
  codex: { name: 'ChatGPT', logo: 'G', app: 'Codex', install: 'Codex 앱을 설치하면 ChatGPT 계정으로 로그인할 수 있어요 (openai.com/codex).' },
};

async function loadAiStatus() {
  try {
    aiStatus = await widget.aiStatus();
  } catch {
    aiStatus = null;
  }
  renderModelPicker();
  if (!$('#settings').hidden) renderAccounts();
  return aiStatus;
}

let loginBusy = null; // 로그인 진행 중인 제공자
let accountNote = {};  // 제공자별 안내 문구 (로그인 실패 등)

function renderAccounts() {
  const box = $('#ai-accounts');
  if (!aiStatus) { box.innerHTML = '<div class="hint">계정 상태를 확인하는 중…</div>'; return; }
  box.innerHTML = Object.entries(PROVIDERS).map(([k, p]) => {
    const s = aiStatus[k];
    const busy = loginBusy === k || (k === 'codex' && s.loggingIn);
    let sub = !s.installed ? p.install : busy ? '브라우저에서 로그인을 마쳐 주세요…' : s.account;
    if (accountNote[k] && !s.loggedIn && !busy) sub = accountNote[k];
    let btn = '';
    if (s.installed && !busy) {
      if (!s.loggedIn) btn = `<button class="btn" data-login="${k}">로그인</button>`;
      else if (k === 'codex') btn = `<button class="btn ghost" data-logout="${k}">로그아웃</button>`;
    }
    const scope = k === 'codex' ? `<span title="Codex CLI ${esc(s.version || '')} (고정 버전)">위젯 전용 로그인</span>` : 'Claude Code 와 공유';
    return `<div class="acct">
      <span class="logo ${k}">${p.logo}</span>
      <div><div class="nm">${p.name} <span class="muted" style="font-weight:400">· ${scope}</span></div>
        <div class="sub2 ${s.loggedIn ? 'ok' : ''}" title="${esc(sub)}">${esc(sub)}</div></div>
      ${btn}</div>`;
  }).join('');
}

$('#ai-accounts').addEventListener('click', async (e) => {
  const out = e.target.closest('[data-logout]')?.dataset.logout;
  if (out) {
    await widget.aiLogout(out);
    return loadAiStatus();
  }
  const k = e.target.closest('[data-login]')?.dataset.login;
  if (!k) return;
  loginBusy = k;
  accountNote[k] = '';
  renderAccounts();
  const r = await widget.aiLogin(k);
  if (k === 'codex') {
    // Codex 는 로그인 창이 닫히면 결과를 바로 알려 준다
    loginBusy = null;
    if (!r.ok) accountNote[k] = r.error;
    return loadAiStatus();
  }
  // Claude 는 콘솔 창에서 진행되므로 2분 동안 상태를 확인한다
  clearInterval(loginPoll);
  let n = 0;
  loginPoll = setInterval(async () => {
    const st = await loadAiStatus();
    if (++n > 40 || st?.claude?.loggedIn) {
      clearInterval(loginPoll);
      loginBusy = null;
      renderAccounts();
    }
  }, 3000);
});

function renderModelPicker() {
  const sel = $('#ai-model');
  const a = config.ai;
  const groups = [];
  for (const [k, p] of Object.entries(PROVIDERS)) {
    const s = aiStatus?.[k];
    if (!s?.loggedIn) continue;
    const opts = s.models.map((m) => `<option value="${k}:${esc(m.id)}">${esc(m.label)}</option>`).join('');
    groups.push(`<optgroup label="${p.name}">${opts}</optgroup>`);
  }
  sel.innerHTML = groups.length ? groups.join('') : '<option value="">로그인 필요</option>';
  const current = a.provider === 'claude' ? `claude:${a.claudeModel}` : `codex:${a.codexModel || aiStatus?.codex?.defaultModel}`;
  sel.value = current;
  if (!sel.value && sel.options.length && groups.length) {
    // 저장된 모델이 없으면 로그인된 첫 모델로 맞춘다
    sel.selectedIndex = 0;
    applyModel(sel.value);
  }
  $('#ai-input').placeholder = groups.length ? `${aiName()}에게 물어보기 (Enter 전송)` : '설정에서 Claude 또는 ChatGPT 로그인이 필요해요';
}

function applyModel(v) {
  const [provider, ...rest] = v.split(':');
  const model = rest.join(':');
  if (!provider || !model) return;
  patchConfig({ ai: provider === 'claude' ? { provider, claudeModel: model } : { provider, codexModel: model } });
}

$('#ai-model').addEventListener('change', (e) => applyModel(e.target.value));

// ── AI 성격·지침 ──

let presets = null;
let personaTimer = null;

async function fillPersona() {
  presets ||= await widget.aiPresets();
  const a = config.ai;
  const preset = a.persona ? 'custom' : a.personaPreset || 'pro';
  $('#set-cat-tone').checked = !!a.catTone;
  $('#set-avatar').innerHTML = catAvatar(48);
  if (document.activeElement?.id !== 'set-ai-name') $('#set-ai-name').value = a.name || '';
  setSeg('set-preset', preset);
  $('#set-persona').value = a.persona || presets[preset] || presets.pro;
  $('#set-about').value = a.about || '';
  $('#set-rules').value = a.rules || '';
  countPersona();
}

function countPersona() {
  for (const k of ['persona', 'about', 'rules']) $(`#c-${k}`).textContent = `${$(`#set-${k}`).value.length} / 2000`;
}

function savePersona(patch) {
  clearTimeout(personaTimer);
  $('#persona-saved').textContent = '';
  personaTimer = setTimeout(async () => {
    await patchConfig({ ai: patch });
    $('#persona-saved').textContent = '✓ 저장됨 — 다음 질문부터 적용돼요';
  }, 500);
}

$('#set-preset').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  setSeg('set-preset', v);
  if (v === 'custom') {
    // 지금 보이는 문구를 그대로 직접 작성의 출발점으로 쓴다
    savePersona({ persona: $('#set-persona').value.trim() });
    $('#set-persona').focus();
  } else {
    $('#set-persona').value = presets[v];
    savePersona({ personaPreset: v, persona: '' });
  }
  countPersona();
});
$('#set-persona').addEventListener('input', () => {
  setSeg('set-preset', 'custom');
  countPersona();
  savePersona({ persona: $('#set-persona').value.trim() });
});
$('#set-cat-tone').addEventListener('change', (e) => {
  config.ai.catTone = e.target.checked;
  renderAiProfile();
  savePersona({ catTone: e.target.checked });
});
$('#set-ai-name').addEventListener('input', () => {
  const name = $('#set-ai-name').value.trim();
  config.ai.name = name;
  renderAiProfile();
  renderModelPicker();
  savePersona({ name });
});
$('#set-about').addEventListener('input', () => { countPersona(); savePersona({ about: $('#set-about').value.trim() }); });
$('#set-rules').addEventListener('input', () => { countPersona(); savePersona({ rules: $('#set-rules').value.trim() }); });

function openSettings() {
  $$('#app > section:not(#settings)').forEach((s) => { s.dataset.wasHidden = s.hidden ? '1' : ''; s.hidden = true; });
  $('#settings').hidden = false;
  fillSettings();
  loadAiStatus();
  refreshGcal();
  $('#scroller').scrollTop = 0;
}

function closeSettings() {
  $('#settings').hidden = true;
  $('#sec-clock').hidden = false;
  applyAppearance();
  // 캘린더 주소 저장
  const urls = $('#set-ical').value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (urls.join('\n') !== config.calendar.icalUrls.join('\n')) {
    patchConfig({ calendar: { icalUrls: urls } }).then(() => loadCalendar(true));
  }
  loadWeather();
  loadCalendar();
}

function setSeg(id, value) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === value));
}

function fillSettings() {
  const w = config.window, a = config.appearance;
  setSeg('set-mode', w.mode);
  setSeg('set-theme', a.theme);
  $('#set-opacity').value = w.opacity;
  $('#v-opacity').textContent = `${Math.round(w.opacity * 100)}%`;
  $('#set-glass').value = a.glass;
  $('#v-glass').textContent = `${Math.round(a.glass * 100)}%`;
  $('#set-zoom').value = w.zoom;
  $('#v-zoom').textContent = `${Math.round(w.zoom * 100)}%`;
  $('#set-locked').checked = w.locked;
  $('#set-autostart').checked = config.autoStart;
  $('#set-24h').checked = a.clock24h;
  $('#set-seconds').checked = a.showSeconds;
  $('#set-accent').innerHTML = ACCENTS.map((c) => `<button data-c="${c}" class="${c === a.accent ? 'on' : ''}" style="background:${c}"></button>`).join('');
  $$('#set-sections input').forEach((i) => { i.checked = config.sections[i.dataset.k]; });
  $('#kma-key-state').textContent = config.weather.hasKey ? '✓ 인증키가 저장되어 있어요. 바꾸려면 새 키를 입력하세요.' : '공공데이터포털(data.go.kr)에서 “기상청_단기예보 조회서비스”를 신청하고 일반 인증키를 입력하세요.';
  $('#set-ical').value = config.calendar.icalUrls.join('\n');
  $('#set-holidays').checked = config.calendar.koreanHolidays;
  fillNotifySettings();
  renderAirSettings();
  fillBriefSettings();
  renderHotkeySettings();
  $('#set-effort').value = config.ai.effort;
  $('#set-websearch').checked = config.ai.webSearch;
  $('#set-share-memos').checked = config.ai.shareMemos !== false;
  renderAccounts();
  // 입력 중에는 덮어쓰지 않는다
  if (!['set-persona', 'set-about', 'set-rules'].includes(document.activeElement?.id)) fillPersona();
  renderLocations();
}

function renderLocations() {
  $('#loc-list').innerHTML = config.weather.locations.map((l, i) =>
    `<li><span>${esc(l.name)}</span><button class="del" data-i="${i}" title="삭제">✕</button></li>`).join('');
}

$('#btn-settings').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
widget.onOpenSettings(openSettings);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-settings]')) openSettings();
});

$('#set-mode').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) patchConfig({ window: { mode: v } }).then(fillSettings);
});
$('#set-theme').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (v) patchConfig({ appearance: { theme: v } }).then(fillSettings);
});
$('#set-accent').addEventListener('click', (e) => {
  const c = e.target.closest('button')?.dataset.c;
  if (c) patchConfig({ appearance: { accent: c } }).then(fillSettings);
});

const onRange = (id, label, fn) => {
  $(id).addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $(label).textContent = `${Math.round(v * 100)}%`;
    fn(v);
  });
};
let zoomTimer = null;
onRange('#set-opacity', '#v-opacity', (v) => patchConfig({ window: { opacity: v } }));
onRange('#set-glass', '#v-glass', (v) => {
  document.documentElement.style.setProperty('--glass', v);
  config.appearance.glass = v;
  widget.updateConfig({ appearance: { glass: v } });
});
onRange('#set-zoom', '#v-zoom', (v) => {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => patchConfig({ window: { zoom: v } }), 150);
});

$('#set-locked').addEventListener('change', (e) => patchConfig({ window: { locked: e.target.checked } }));
$('#set-autostart').addEventListener('change', (e) => patchConfig({ autoStart: e.target.checked }));
$('#set-24h').addEventListener('change', (e) => patchConfig({ appearance: { clock24h: e.target.checked } }).then(tickClock));
$('#set-seconds').addEventListener('change', (e) => patchConfig({ appearance: { showSeconds: e.target.checked } }).then(tickClock));
$('#set-sections').addEventListener('change', (e) => {
  const k = e.target.dataset.k;
  if (k) {
    config.sections[k] = e.target.checked;
    widget.updateConfig({ sections: { [k]: e.target.checked } });
  }
});
$('#set-holidays').addEventListener('change', (e) => patchConfig({ calendar: { koreanHolidays: e.target.checked } }).then(() => loadCalendar(true)));
$('#set-effort').addEventListener('change', (e) => patchConfig({ ai: { effort: e.target.value } }));
$('#set-websearch').addEventListener('change', (e) => patchConfig({ ai: { webSearch: e.target.checked } }));
$('#set-share-memos').addEventListener('change', (e) => patchConfig({ ai: { shareMemos: e.target.checked } }));

$('#save-kma-key').addEventListener('click', async () => {
  const v = $('#set-kma-key').value.trim();
  if (!v) return;
  config = await widget.setSecret('weather', v);
  $('#set-kma-key').value = '';
  fillSettings();
});

$('#loc-list').addEventListener('click', (e) => {
  const i = e.target.closest('[data-i]')?.dataset.i;
  if (i == null) return;
  const locations = config.weather.locations.filter((_, j) => j !== Number(i));
  patchConfig({ weather: { locations } }).then(() => { renderLocations(); weatherData = []; });
});

let searchResults = [];
$('#loc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#loc-q').value.trim();
  if (!q) return;
  $('#loc-results').innerHTML = '<li class="muted">검색 중…</li>';
  try {
    searchResults = await widget.searchPlace(q);
  } catch {
    searchResults = [];
  }
  $('#loc-results').innerHTML = searchResults.length
    ? searchResults.map((r, i) => `<li data-r="${i}"><span>${esc(r.name)}</span><span class="muted">${esc(r.region)}</span></li>`).join('')
    : '<li class="muted">검색 결과가 없어요</li>';
});
$('#loc-results').addEventListener('click', (e) => {
  const i = e.target.closest('[data-r]')?.dataset.r;
  if (i == null) return;
  const r = searchResults[Number(i)];
  const locations = [...config.weather.locations, { name: r.name, latitude: r.latitude, longitude: r.longitude }].slice(-3);
  $('#loc-results').innerHTML = '';
  $('#loc-q').value = '';
  patchConfig({ weather: { locations } }).then(() => { renderLocations(); weatherData = []; });
});

// ───────────────────────── 시작 ─────────────────────────

widget.onConfigChanged((c) => {
  config = c;
  applyAppearance();
  if (!$('#settings').hidden) fillSettings();
  renderModelPicker();
  renderTodos();
  renderCalendar();
  tickClock();
});

// 모든 스크립트(schedule.js, memos.js, layout.js …)가 로드된 뒤에 시작한다.
// (await 사이에 다음 <script> 보다 먼저 이어서 실행될 수 있기 때문)
async function init() {
  config = await widget.getConfig();
  applyAppearance();
  tickClock();
  renderTodos();
  renderMemos();
  renderCalendar();
  loadWeather();
  loadCalendar();
  loadAiStatus();
  renderAiProfile();
  restoreChat();
  setInterval(tickClock, 1000);
  setInterval(() => loadWeather(), 10 * 60e3);
  setInterval(() => loadCalendar(true), 15 * 60e3);
}

document.addEventListener('DOMContentLoaded', init);

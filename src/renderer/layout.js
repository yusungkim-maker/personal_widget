// 카드 접기(요약 한 줄) + 컴팩트 모드("오늘" 카드)
// 기존 render 함수들을 감싸서, 내용이 바뀔 때마다 요약도 함께 갱신한다.

const CARD_IDS = { weather: 'sec-weather', calendar: 'sec-calendar', todo: 'sec-todo', memo: 'sec-memo', ai: 'sec-ai' };
const ICON_COMPACT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h10"/></svg>';
const ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h10"/></svg>';

const todayKey = () => ymd(new Date());
const sep = '<span class="sep">·</span>';

function applyLayout() {
  if (!config) return;
  const collapsed = config.collapsed || {};
  for (const [k, id] of Object.entries(CARD_IDS)) $(`#${id}`).classList.toggle('collapsed', !!collapsed[k]);
  const compact = !!config.appearance.compact;
  document.body.classList.toggle('compact', compact);
  $('#sec-today').hidden = !compact;
  const b = $('#btn-compact');
  b.innerHTML = compact ? ICON_EXPAND : ICON_COMPACT;
  b.title = compact ? '전체 보기' : '컴팩트 모드 (시계와 오늘만)';
  b.classList.toggle('on', compact);
  renderSummaries();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('.card-toggle');
  if (!t) return;
  const k = t.dataset.card;
  const collapsed = { ...(config.collapsed || {}), [k]: !(config.collapsed || {})[k] };
  config.collapsed = collapsed;
  applyLayout();
  widget.updateConfig({ collapsed });
});

$('#btn-compact').addEventListener('click', () => {
  config.appearance.compact = !config.appearance.compact;
  applyLayout();
  widget.updateConfig({ appearance: { compact: config.appearance.compact } });
});

// ── 요약 ──

function nextEvent() {
  const now = new Date().toISOString();
  return allEvents().find((e) => !e.holiday && !e.allDay && e.start >= now)
    || allEvents().find((e) => !e.holiday && e.startDay > todayKey());
}

function eventShort(e) {
  const [, m, d] = e.startDay.split('-').map(Number);
  const day = e.startDay === todayKey() ? '' : `${m}/${d} `;
  return `${day}${e.allDay ? '' : `<b>${hhmm(new Date(e.start))}</b> `}${esc(e.title)}`;
}

function dueTodos() {
  const today = todayKey();
  const open = config.todos.filter((t) => !t.done && t.date);
  return { today: open.filter((t) => t.date === today), overdue: open.filter((t) => t.date < today) };
}

function renderSummaries() {
  if (!config) return;
  // 날씨
  const w = weatherData.filter((p) => p.ok);
  // 오늘 남은 시간 중 가장 높은 강수확률과 그 시각
  const peak = w.map((p) => p.data.daily[0] || {}).reduce((a, b) => ((b.pop || 0) > (a.pop || 0) ? b : a), {});
  const rain = peak.pop || 0;
  $('#sum-weather').innerHTML = w.length
    ? w.map((p) => `${esc(p.name)} <b>${fmtT(p.data.current.temp)}</b> ${esc(p.data.current.desc)}`).join(sep)
      + (rain >= 60 ? `${sep}<span class="warn">☂ ${peak.popHour != null ? `${hourLabel(peak.popHour)} ` : ''}비 ${rain}%</span>` : '')
      + ((typeof airData !== 'undefined' && airData.some((a) => a.grade >= 2)) ? `${sep}<span class="warn">미세먼지 나쁨</span>` : '')
      + ((typeof warnData !== 'undefined' && warnData.warnings?.length) ? `${sep}<span class="warn">⚠ ${esc(warnData.warnings[0].names[0])}</span>` : '')
    : '날씨를 불러오는 중…';

  // 달력
  const today = todayKey();
  const todayEvents = eventsOn(today).filter((e) => !e.holiday);
  const due = dueTodos();
  const next = nextEvent();
  $('#sum-calendar').innerHTML = `오늘 <b>일정 ${todayEvents.length}</b>${due.today.length ? `${sep}할 일 ${due.today.length}` : ''}`
    + (next ? `${sep}다음 ${eventShort(next)}` : '');

  // 할 일
  const left = config.todos.filter((t) => !t.done).length;
  $('#sum-todo').innerHTML = left
    ? `남은 <b>${left}개</b>${due.today.length ? `${sep}오늘 마감 ${due.today.length}` : ''}${due.overdue.length ? `${sep}<span class="warn">지남 ${due.overdue.length}</span>` : ''}`
    : '할 일이 없어요';

  // 메모
  const memosList = [...(config.memos || [])].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#sum-memo').innerHTML = memosList.length
    ? `<b>${memosList.length}개</b>${sep}최근: ${esc(memosList[0].title || String(memosList[0].body || '').split('\n')[0] || '제목 없는 메모')}`
    : '메모가 없어요';

  // AI
  const last = [...$$('#ai-log .msg.bot')].pop();
  $('#sum-ai').innerHTML = last ? `최근 답변: ${esc(last.innerText.replace(/\s+/g, ' ').slice(0, 60))}` : `${esc(aiName())}에게 물어보려면 펼쳐 주세요`;

  if (config.appearance.compact) renderToday();
}

// ── 컴팩트 모드의 "오늘" 카드 ──

function renderToday() {
  const w = weatherData.filter((p) => p.ok);
  $('#today-weather').innerHTML = w.length ? w.map((p) => {
    const c = p.data.current, t = p.data.daily[0] || {};
    return `<div class="tw-row">${weatherIcon(c.icon, 22)}<span class="nm">${esc(p.name)}</span><span class="tp">${fmtT(c.temp)}</span>
      <span class="mm"><span class="hi">${fmtT(t.max)}</span>/<span class="lo">${fmtT(t.min)}</span> ${popNow(p)} ${popPeak(p)}</span>
      <span class="dust" data-dust="${esc(p.name)}"></span></div>`;
  }).join('') : '<div class="tl-empty">날씨를 불러오는 중…</div>';

  const today = todayKey();
  const events = eventsOn(today);
  const due = dueTodos();
  const todos = [...due.overdue, ...due.today];
  let html = `<div class="tl-h">${dayLabel(today)}</div>`;
  html += events.length
    ? events.map((e) => `<div class="ev ${e.holiday ? 'holiday' : e.flex ? 'flex' : ''}"><span class="bar"></span><span class="t">${fmtEventTime(e, today)}</span><span class="ti">${esc(e.title)}</span></div>`).join('')
    : '<div class="tl-empty">오늘 일정이 없어요</div>';
  if (todos.length) {
    html += '<div class="tl-h">할 일</div>';
    html += todos.map((t) => `<div class="ev todo-ev" data-tid="${t.id}"><span class="bar"></span>
      <span class="t"><button class="mini-chk" data-act="toggle" title="완료"></button>${t.date < today ? '<span class="warn">지남</span>' : '오늘'}</span>
      <span class="ti">${esc(t.text)}</span>${t.url ? `<button class="lk icon" data-act="open-link" title="${esc(t.url)}">${ICON_LINK}</button>` : ''}</div>`).join('');
  }
  const next = nextEvent();
  if (next && next.startDay !== today) html += `<div class="tl-h">다음 일정</div><div class="ev"><span class="bar"></span><span class="t">${eventShort(next).replace(/<b>|<\/b>/g, '').split(' ').slice(0, 2).join(' ')}</span><span class="ti">${esc(next.title)}</span></div>`;
  $('#today-list').innerHTML = html;
}

$('#today-list').addEventListener('click', (e) => {
  const tid = e.target.closest('[data-tid]')?.dataset.tid;
  if (tid && e.target.closest('[data-act="toggle"]')) toggleTodo(tid);
  if (tid && e.target.closest('[data-act="open-link"]')) openLink(config.todos.find((t) => t.id === tid)?.url);
});

// ── 기존 렌더 함수 감싸기 ──
for (const name of ['renderWeather', 'renderCalendar', 'renderTodos', 'renderMemos', 'applyAppearance']) {
  const original = window[name];
  window[name] = function (...args) {
    const r = original.apply(this, args);
    if (name === 'applyAppearance') applyLayout();
    else renderSummaries();
    return r;
  };
}

if (config) applyLayout();

// 시계 카드의 근무 시간 줄: flex 에서 읽은 값(하루 한 번)을 기준으로 지금 시각과 대조해 계산한다.
const WORK_GOAL_MIN = 8 * 60; // 하루 근무 목표 (flex 근무 시간 기준)

const workCfg = () => ({ enabled: true, ...(config.work || {}) });
const hm = (t) => { const d = new Date(t); return `${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`; };
const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간 ${pad(min % 60)}분` : `${min}분`);

// 지금까지 근무한 시간(분). 오늘 읽은 값이 없으면 null
function workedMinutes(w = workCfg()) {
  if (w.state !== 'ok' || w.fetchedDay !== new Date().toDateString() || !w.clockInAt) return null;
  return Math.max(0, Math.floor((Date.now() - w.clockInAt) / 60e3));
}

function renderWork() {
  const el = $('#work-line');
  if (!el || !config) return;
  const w = workCfg();
  if (!w.enabled) { el.hidden = true; return; }
  el.hidden = false;
  const isToday = w.fetchedDay === new Date().toDateString();
  let html;
  if (w.state === 'login') {
    html = '<span class="wk-dot off"></span>flex 로그인이 필요해요 <button class="link" data-work="login">로그인</button>';
  } else if (w.state === 'unreadable' && !isToday) {
    html = '<span class="wk-dot off"></span>flex 근무 시간을 읽지 못했어요 <button class="link" data-work="fetch">다시 불러오기</button>';
  } else if (!isToday) {
    html = '<span class="wk-dot off"></span>브라우저를 켜면 flex 근무 시간을 불러와요 <button class="link" data-work="fetch">지금</button>';
  } else if (w.status === '퇴근') {
    html = '<span class="wk-dot done"></span>오늘 근무를 마쳤어요 <span class="muted">(flex)</span>';
  } else if (w.status === '근무 전') {
    html = '<span class="wk-dot off"></span>아직 출근 전이에요 <button class="link" data-work="fetch">다시 확인</button>';
  } else {
    const min = workedMinutes(w) ?? 0;
    const left = WORK_GOAL_MIN - min;
    const pct = Math.min(100, Math.round((min / WORK_GOAL_MIN) * 100));
    html = `<span class="wk-dot on"></span><b>${esc(w.status || '근무 중')} ${dur(min)}</b>
      <span class="muted">· 출근 약 ${hm(w.clockInAt)}</span>
      <span class="wk-left ${left <= 0 ? 'over' : ''}">${left > 0 ? `8시간까지 ${dur(left)} (${hm(Date.now() + left * 60e3)})` : '8시간 채웠어요'}</span>
      <span class="wk-bar"><i style="width:${pct}%"></i></span>`;
  }
  el.innerHTML = html;
  el.title = w.fetchedAt ? `flex 화면 기준 · ${hm(w.fetchedAt)}에 읽음 (누르면 다시 불러와요)` : '';
}

$('#work-line').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-work]')?.dataset.work;
  if (act === 'login') return widget.flex.login();
  if (act === 'fetch' || e.target.closest('#work-line')) {
    $('#work-line').classList.add('loading');
    const r = await widget.flex.fetch();
    $('#work-line').classList.remove('loading');
    if (!r.ok && r.state === 'unreadable') toast('flex 화면에서 근무 시간을 찾지 못했어요', null, 'err');
  }
});

widget.flex.onChanged((w) => { config.work = w; renderWork(); if (!$('#settings').hidden) fillWorkSettings(); });

function workContextLine() {
  const w = workCfg();
  const min = workedMinutes(w);
  if (min == null) return w.status === '퇴근' && w.fetchedDay === new Date().toDateString() ? '오늘 근무: 퇴근함 (flex 기준)' : null;
  return `오늘 근무: ${dur(min)}째 (출근 약 ${hm(w.clockInAt)}, flex 화면 기준, 8시간까지 ${Math.max(0, WORK_GOAL_MIN - min)}분)`;
}

// ── 설정 ──
function fillWorkSettings() {
  const w = workCfg();
  $('#set-work').checked = w.enabled;
  const states = {
    login: 'flex 로그인이 필요해요. 아래 "flex 로그인"으로 한 번만 로그인해 주세요.',
    unreadable: 'flex 화면에서 근무 시간을 찾지 못했어요. flex 화면이 바뀌었을 수 있어요.',
    ok: w.fetchedAt ? `마지막으로 읽은 시각: ${new Date(w.fetchedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${w.status}${w.minutesAtFetch != null ? ` ${dur(w.minutesAtFetch)}` : ''}` : '',
  };
  $('#work-state').textContent = states[w.state] || '아직 불러온 적이 없어요.';
}
$('#set-work').addEventListener('change', async (e) => { config.work = await widget.flex.setEnabled(e.target.checked); renderWork(); });
$('#flex-login').addEventListener('click', () => widget.flex.login());
$('#flex-fetch').addEventListener('click', async () => { const r = await widget.flex.fetch(); fillWorkSettings(); if (r.ok) toast('flex 근무 시간을 불러왔어요'); });
$('#flex-disconnect').addEventListener('click', async () => { await widget.flex.disconnect(); toast('flex 로그인 정보를 지웠어요'); });

// 1분마다 다시 계산 (시계 tick 과 별도로 가볍게)
setInterval(renderWork, 30e3);

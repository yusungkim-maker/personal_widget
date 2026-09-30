// 일정 등록·수정·삭제 (구글 캘린더 동기화), 빠른 추가, 자세히 입력, 할 일 날짜, 뭉치의 등록 카드
// app.js 의 전역(cal, config, renderCalendar, saveTodos 등)을 사용한다.

const FLEX_RE = /연차|반차|반반차|시간차|휴가|병가|경조|공가|재택|원격|외근|출장/;
const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const ICON_MEMO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/></svg>';
const ICON_TODO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';

const dayDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${pad(Math.floor(Math.max(0, Math.min(n, 1439)) / 60))}:${pad(Math.max(0, Math.min(n, 1439)) % 60)}`;

// ───────────────────────── 구글 연결 상태 ─────────────────────────

let gcalState = { hasClient: false, connected: false, email: '', connecting: false };

async function refreshGcal() {
  try { gcalState = await widget.gcal.status(); } catch { /* 그대로 */ }
  renderGcalSettings();
  return gcalState;
}

async function connectGoogle() {
  gcalState.connecting = true;
  renderGcalSettings();
  const r = await widget.gcal.connect();
  await // ───────────────────────── 빠른 입력(전역 단축키)에서 넘어온 작업 ─────────────────────────

widget.quick.onAction((kind, payload) => {
  if (kind === 'todo') addTodo(payload.text, payload.date, payload.url);
  if (kind === 'refresh-calendar') loadCalendar(true);
  const reveal = (card) => {
    // 컴팩트 모드거나 접혀 있으면 펼쳐서 보여 준다
    config.appearance.compact = false;
    config.collapsed = { ...(config.collapsed || {}), [card]: false };
    applyLayout();
    widget.updateConfig({ appearance: { compact: false }, collapsed: config.collapsed });
  };
  if (kind === 'compose') {
    reveal('calendar');
    openComposer(payload);
    $('#sec-calendar').scrollIntoView({ block: 'start' });
  }
  if (kind === 'ask') {
    reveal('ai');
    $('#ai-input').value = payload;
    $('#sec-ai').scrollIntoView({ block: 'end' });
    sendChat();
  }
});

// 설정: 단축키
async function renderHotkeySettings(status) {
  const st = status || await widget.quick.status();
  const sel = $('#set-hotkey');
  const label = (k) => k.replace('Control', 'Ctrl');
  sel.innerHTML = st.options.map((k) => `<option value="${k}">${label(k)}</option>`).join('') + '<option value="">사용 안 함</option>';
  sel.value = config.quick?.hotkey ?? st.options[0];
  $('#hotkey-state').textContent = st.error || (st.hotkey ? `${label(st.hotkey)} 를 누르면 어디서든 입력창이 떠요.` : '단축키를 쓰지 않아요. 트레이 메뉴의 "빠른 입력"으로 열 수 있어요.');
  $('#hotkey-state').classList.toggle('err', !!st.error);
}
$('#set-hotkey').addEventListener('change', async (e) => {
  config.quick = { hotkey: e.target.value };
  renderHotkeySettings(await widget.quick.setHotkey(e.target.value));
});

refreshGcal();
  if (r.ok) {
    toast(`구글 캘린더가 연결됐어요 · ${gcalState.email}`);
    loadCalendar(true);
  } else {
    toast(r.error, null, 'err');
  }
  return r.ok;
}

// ───────────────────────── 알림(토스트) ─────────────────────────

let toastTimer = null;
function toast(msg, action = null, kind = '') {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="link" id="toast-act">${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  if (action) {
    $('#toast-act').onclick = () => { hideToast(); action.run(); };
  }
  toastTimer = setTimeout(hideToast, action ? 7000 : 4000);
}
function hideToast() {
  const t = $('#toast');
  t.classList.remove('show');
  setTimeout(() => { t.hidden = true; }, 200);
}

// ───────────────────────── 동기화 (낙관적 반영 + 실행 취소) ─────────────────────────

function inputToLocal(input) {
  const s = input.allDay ? dayDate(input.startDay) : new Date(`${input.startDay}T${input.startTime}:00`);
  const e = input.allDay ? new Date(`${input.endDay || input.startDay}T23:59:59`) : new Date(`${input.endDay || input.startDay}T${input.endTime}:00`);
  return {
    title: input.title, start: s.toISOString(), end: e.toISOString(),
    startDay: input.startDay, endDay: input.endDay || input.startDay, allDay: !!input.allDay,
    location: input.location || '', flex: FLEX_RE.test(input.title), source: 'google',
  };
}

function eventToInput(e) {
  const s = new Date(e.start), en = new Date(e.end);
  return {
    title: e.title, startDay: e.startDay, endDay: e.endDay, allDay: e.allDay,
    startTime: e.allDay ? '09:00' : hhmm(s), endTime: e.allDay ? '10:00' : hhmm(en),
    location: e.location || '', description: e.description || '', reminder: e.reminder ?? null,
  };
}

function focusDay(day) {
  cal.selected = day;
  const d = dayDate(day);
  if (d.getFullYear() !== cal.view.getFullYear() || d.getMonth() !== cal.view.getMonth()) {
    cal.view = new Date(d.getFullYear(), d.getMonth(), 1);
    cal.userMoved = true;
    loadCalendar();
  }
}

const withFlex = (e) => ({ ...e, flex: FLEX_RE.test(e.title) });

async function createGoogleEvent(input) {
  const temp = { ...inputToLocal(input), id: `tmp-${Date.now()}-${Math.random()}`, pending: true, op: { kind: 'create', input } };
  cal.pending.push(temp);
  focusDay(input.startDay);
  renderCalendar();
  const r = await widget.gcal.create(input);
  cal.pending = cal.pending.filter((p) => p !== temp);
  if (r.ok) {
    cal.events.push(withFlex(r.value));
    renderCalendar();
    toast(`구글 캘린더에 추가했어요 · ${input.title}`, { label: '실행 취소', run: () => deleteGoogleEvent(r.value.gid, { undo: true }) });
    return r.value;
  }
  cal.pending.push({ ...temp, pending: false, failed: true });
  renderCalendar();
  toast(r.error, null, 'err');
  return null;
}

async function updateGoogleEvent(gid, input, { undo = false, quiet = false } = {}) {
  const original = cal.events.find((e) => e.gid === gid);
  const temp = { ...inputToLocal(input), id: `tmp-${Date.now()}`, pending: true, op: { kind: 'update', gid, input } };
  cal.hidden.add(gid);
  cal.pending.push(temp);
  focusDay(input.startDay);
  renderCalendar();
  const r = await widget.gcal.update(gid, input);
  cal.pending = cal.pending.filter((p) => p !== temp);
  cal.hidden.delete(gid);
  if (r.ok) {
    cal.events = cal.events.map((e) => (e.gid === gid ? withFlex(r.value) : e));
    renderCalendar();
    if (quiet) { /* 카드가 결과를 보여 준다 */ } else if (!undo && original) {
      toast('일정을 수정했어요', { label: '되돌리기', run: () => updateGoogleEvent(gid, eventToInput(original), { undo: true }) });
    } else if (undo) toast('수정을 되돌렸어요');
    return r.value;
  }
  renderCalendar();
  toast(r.error, null, 'err');
  return null;
}

async function deleteGoogleEvent(gid, { undo = false, quiet = false } = {}) {
  const original = cal.events.find((e) => e.gid === gid);
  cal.hidden.add(gid);
  renderCalendar();
  const r = await widget.gcal.remove(gid);
  cal.hidden.delete(gid);
  if (r.ok) {
    cal.events = cal.events.filter((e) => e.gid !== gid);
    renderCalendar();
    if (quiet) { /* 카드가 결과를 보여 준다 */ } else if (undo) toast('추가를 취소했어요');
    else if (original) toast(`삭제했어요 · ${original.title}`, { label: '실행 취소', run: () => createGoogleEvent(eventToInput(original)) });
    return true;
  }
  renderCalendar();
  toast(r.error, null, 'err');
  return false;
}

// 실패한 일정: 다시 시도 / 취소
$('#cal-events').addEventListener('click', (e) => {
  const retry = e.target.closest('[data-retry]')?.dataset.retry;
  const discard = e.target.closest('[data-discard]')?.dataset.discard;
  const id = retry || discard;
  if (id) {
    const p = cal.pending.find((x) => x.id === id);
    cal.pending = cal.pending.filter((x) => x.id !== id);
    renderCalendar();
    if (retry && p?.op.kind === 'create') createGoogleEvent(p.op.input);
    if (retry && p?.op.kind === 'update') updateGoogleEvent(p.op.gid, p.op.input);
    return;
  }
  const tid = e.target.closest('[data-tid]')?.dataset.tid;
  if (tid && e.target.closest('[data-act="toggle"]')) return toggleTodo(tid);
  if (tid && e.target.closest('[data-act="open-link"]')) return openLink(config.todos.find((t) => t.id === tid)?.url);
  const gid = e.target.closest('[data-gid]')?.dataset.gid;
  if (gid) {
    const ev = cal.events.find((x) => x.gid === gid);
    if (!ev) return;
    if (ev.editable === false) return toast('초대받은 일정이라 여기서는 수정할 수 없어요');
    openComposer(eventToInput(ev), { editGid: gid });
  }
});

// ───────────────────────── 한 줄 빠른 추가 ─────────────────────────

const qa = $('#qa-input');

function qaParse() {
  const text = qa.value.trim();
  return text ? NL.parse(text, { base: dayDate(cal.selected) }) : null;
}

function parsedToInput(r) {
  return {
    title: r.title, startDay: r.startDay, endDay: r.endDay, allDay: r.allDay,
    startTime: r.startTime || '09:00', endTime: r.endTime || '10:00', location: r.location, description: '', reminder: null,
  };
}

function renderQaPreview() {
  const r = qaParse();
  const box = $('#qa-preview');
  if (!r) { box.hidden = true; return; }
  const hint = gcalState.connected ? '<kbd>Enter</kbd> 바로 등록 · <kbd>Tab</kbd> 자세히' : '<kbd>Enter</kbd> 자세히 입력 (구글 연결 필요)';
  box.innerHTML = `<div class="pv-main">${ICON_CAL}<span><b>${esc(r.title || '제목을 적어 주세요')}</b>
    <span class="pv-when">${esc(NL.describe(r))}${r.location ? ` · ${esc(r.location)}` : ''}</span></span></div>
    <div class="pv-hint">${hint}</div>`;
  box.classList.toggle('warn', !r.title);
  box.hidden = false;
}

qa.addEventListener('input', renderQaPreview);
qa.addEventListener('focus', renderQaPreview);
qa.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== qa) $('#qa-preview').hidden = true; }, 150));
qa.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  const r = qaParse();
  if (e.key === 'Escape') { qa.value = ''; renderQaPreview(); qa.blur(); }
  if (e.key === 'Tab' && r) {
    e.preventDefault();
    qa.value = '';
    renderQaPreview();
    openComposer(parsedToInput(r));
  }
});
$('#qa-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = qaParse();
  if (!r) return;
  if (!r.title) { shake(qa); return; }
  qa.value = '';
  renderQaPreview();
  if (gcalState.connected) createGoogleEvent(parsedToInput(r));
  else openComposer(parsedToInput(r));
});

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  el.focus();
}

// ───────────────────────── 자세히 입력 ─────────────────────────

let cmp = { editGid: null, touchedDate: false, touchedTime: false, duration: 60, deleteArmed: false };

function nextHalfHour() {
  const n = new Date();
  const m = n.getHours() * 60 + n.getMinutes();
  return Math.min(Math.ceil((m + 1) / 30) * 30, 23 * 60);
}

function openComposer(prefill = {}, { editGid = null } = {}) {
  const day = prefill.startDay || cal.selected;
  const isToday = day === ymd(new Date());
  const start = prefill.startTime || fromMin(isToday ? nextHalfHour() : 10 * 60);
  const end = prefill.endTime || fromMin(toMin(start) + 60);
  cmp = { editGid, touchedDate: !!prefill.startDay, touchedTime: !!prefill.startTime, duration: toMin(end) - toMin(start), deleteArmed: false };

  $('#cmp-heading').textContent = editGid ? '일정 수정' : '새 일정';
  $('#cmp-title').value = prefill.title || '';
  $('#cmp-date').value = day;
  $('#cmp-allday').checked = !!prefill.allDay;
  $('#cmp-start').value = start;
  $('#cmp-end').value = end;
  $('#cmp-loc').value = prefill.location || '';
  $('#cmp-desc').value = prefill.description || '';
  $('#cmp-remind').value = prefill.reminder == null ? '' : String(prefill.reminder);
  $('#cmp-delete').hidden = !editGid;
  $('#cmp-delete').textContent = '삭제';
  $('#cmp-parsed')?.remove();

  focusDay(day);
  renderCalendar();
  syncComposer();
  $('#qa-form').hidden = true;
  $('#qa-preview').hidden = true;
  $('#cal-events').hidden = true;
  $('#composer').hidden = false;
  const t = $('#cmp-title');
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
}

function closeComposer() {
  $('#composer').hidden = true;
  $('#qa-form').hidden = false;
  $('#cal-events').hidden = false;
}

function syncComposer() {
  const allDay = $('#cmp-allday').checked;
  $('#cmp-times').hidden = allDay;
  $('#cmp-dur').hidden = allDay;
  const dur = toMin($('#cmp-end').value || '00:00') - toMin($('#cmp-start').value || '00:00');
  $$('#cmp-dur button').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === dur));
  $('#cmp-end').classList.toggle('invalid', !allDay && dur <= 0);

  const note = $('#cmp-note');
  const save = $('#cmp-save');
  save.disabled = false;
  if (gcalState.connected) {
    note.hidden = true;
    save.textContent = cmp.editGid ? '저장' : '구글 캘린더에 추가';
  } else if (gcalState.hasClient) {
    note.hidden = false;
    note.innerHTML = '구글 계정이 아직 연결되지 않았어요. 저장하면 연결부터 진행해요.';
    save.textContent = '연결하고 추가';
  } else {
    note.hidden = false;
    note.innerHTML = '구글 캘린더에 쓰려면 한 번만 준비가 필요해요. <button class="link" id="cmp-setup">준비하기</button>';
    save.textContent = '구글 캘린더에 추가';
    save.disabled = true;
    $('#cmp-setup').onclick = () => { openSettings(); setTimeout(() => $('#google-group').scrollIntoView({ behavior: 'smooth' }), 50); };
  }
}

// 제목에 날짜·시간을 적으면 (직접 고치지 않은 칸만) 알아서 채운다
$('#cmp-title').addEventListener('input', () => {
  const r = NL.parse($('#cmp-title').value, { base: dayDate($('#cmp-date').value || cal.selected) });
  $('#cmp-parsed')?.remove();
  const got = [];
  if (r.hasDate && !cmp.touchedDate) { $('#cmp-date').value = r.startDay; got.push(NL.describe({ ...r, allDay: true }).replace(' 종일', '')); }
  if (r.hasTime && !cmp.touchedTime) {
    $('#cmp-allday').checked = false;
    $('#cmp-start').value = r.startTime;
    $('#cmp-end').value = r.endTime;
    got.push(`${r.startTime}–${r.endTime}`);
  }
  if (r.location && !$('#cmp-loc').value) $('#cmp-loc').value = r.location;
  if (got.length) {
    $('#cmp-title').insertAdjacentHTML('afterend', `<div id="cmp-parsed" class="cmp-parsed">알아들었어요: ${esc(got.join(' '))} · 제목은 “${esc(r.title || '…')}”</div>`);
  }
  syncComposer();
});
$('#cmp-date').addEventListener('input', () => { cmp.touchedDate = true; });
$('#cmp-allday').addEventListener('change', syncComposer);
$('#cmp-start').addEventListener('input', () => {
  cmp.touchedTime = true;
  // 시작을 옮기면 길이는 유지한다
  $('#cmp-end').value = fromMin(toMin($('#cmp-start').value) + Math.max(cmp.duration, 15));
  syncComposer();
});
$('#cmp-end').addEventListener('input', () => {
  cmp.touchedTime = true;
  cmp.duration = toMin($('#cmp-end').value) - toMin($('#cmp-start').value);
  syncComposer();
});
$('#cmp-dur').addEventListener('click', (e) => {
  const m = Number(e.target.closest('[data-m]')?.dataset.m);
  if (!m) return;
  cmp.touchedTime = true;
  cmp.duration = m;
  $('#cmp-end').value = fromMin(toMin($('#cmp-start').value) + m);
  syncComposer();
});

function composerInput() {
  const raw = $('#cmp-title').value.trim();
  // 제목에서 날짜·시간 표현을 걷어낸 깔끔한 제목을 쓴다 (알아들은 게 있을 때만)
  const r = NL.parse(raw, { base: dayDate($('#cmp-date').value) });
  const title = (r.hasDate || r.hasTime) && r.title ? r.title : raw;
  const allDay = $('#cmp-allday').checked;
  const remind = $('#cmp-remind').value;
  return {
    title, startDay: $('#cmp-date').value, endDay: $('#cmp-date').value, allDay,
    startTime: $('#cmp-start').value, endTime: $('#cmp-end').value,
    location: $('#cmp-loc').value.trim(), description: $('#cmp-desc').value.trim(),
    reminder: remind === '' ? null : Number(remind),
  };
}

async function saveComposer() {
  const input = composerInput();
  if (!input.title) return shake($('#cmp-title'));
  if (!input.startDay) return shake($('#cmp-date'));
  if (!input.allDay && toMin(input.endTime) <= toMin(input.startTime)) return shake($('#cmp-end'));
  if (!gcalState.connected) {
    if (!gcalState.hasClient) return;
    $('#cmp-save').disabled = true;
    $('#cmp-save').textContent = '브라우저에서 로그인 중…';
    const ok = await connectGoogle();
    syncComposer();
    if (!ok) return;
  }
  const gid = cmp.editGid;
  closeComposer();
  if (gid) updateGoogleEvent(gid, input);
  else createGoogleEvent(input);
}

$('#cmp-save').addEventListener('click', saveComposer);
$('#cmp-close').addEventListener('click', closeComposer);
$('#cmp-delete').addEventListener('click', () => {
  // 실수 방지: 한 번 더 눌러야 삭제
  if (!cmp.deleteArmed) {
    cmp.deleteArmed = true;
    $('#cmp-delete').textContent = '한 번 더 누르면 삭제';
    setTimeout(() => { cmp.deleteArmed = false; if (!$('#composer').hidden) $('#cmp-delete').textContent = '삭제'; }, 2500);
    return;
  }
  const gid = cmp.editGid;
  closeComposer();
  deleteGoogleEvent(gid);
});
$('#composer').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); closeComposer(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.target.id === 'cmp-title')) { e.preventDefault(); saveComposer(); }
});

// 달력: + 버튼, 날짜 두 번 누르기
$('#cal-add').addEventListener('click', () => openComposer({ startDay: cal.selected }));
$('#cal-grid').addEventListener('dblclick', (e) => {
  const day = e.target.closest('[data-day]')?.dataset.day;
  if (day) openComposer({ startDay: day });
});

// ───────────────────────── 할 일 날짜 ─────────────────────────

let todoDate = null;       // 날짜 칸에서 직접 고른 날짜
let todoIgnoreParse = false; // ✕ 로 자동 인식 날짜를 뺐으면 다시 읽지 않는다
let todoPicking = false;     // 날짜 선택 창이 떠 있는 동안은 접지 않는다

function todoDraft() {
  const raw = $('#todo-input').value.trim();
  // 주소는 먼저 떼어 낸다 (주소 속 숫자를 날짜로 읽지 않도록)
  const { text, url } = splitLink(raw);
  const r = todoIgnoreParse || !text ? null : NL.parse(text);
  const parsed = r && r.hasDate ? r : null;
  const linkRaw = $('#todo-link').value.trim();
  return {
    text: parsed && parsed.title ? parsed.title : text,
    url: (linkRaw && cleanUrl(linkRaw)) || url,
    badLink: !!linkRaw && !cleanUrl(linkRaw),
    date: todoDate || parsed?.startDay || null,
    auto: !todoDate && !!parsed,
  };
}

// 입력칸 아래 날짜·링크 줄: 날짜는 문장에서 읽은 값도 보여 준다
function renderTodoExtra() {
  const d = todoDraft();
  const label = $('#todo-date-label');
  const btn = $('#todo-date-btn');
  if (d.date) {
    const [, m, dd] = d.date.split('-').map(Number);
    label.textContent = `${m}/${dd} (${DOW[new Date(d.date + 'T00:00').getDay()]})까지`;
    btn.title = `${NL.describe({ startDay: d.date, allDay: true }).replace(' 종일', '')}까지${d.auto ? ' (문장에서 읽었어요)' : ''} · 누르면 바꾸기`;
  } else {
    label.textContent = '날짜';
    btn.title = '마감 날짜 (달력에 표시돼요)';
  }
  btn.classList.toggle('on', !!d.date);
  $('#todo-date-clear').hidden = !d.date;
  $('.tf-link').classList.toggle('on', !!d.url);
  $('.tf-link').classList.toggle('bad', d.badLink);
}

function setTodoOpen(open) {
  $('#todo-form').classList.toggle('open', open);
}

function todoHasDraft() {
  return !!($('#todo-input').value.trim() || $('#todo-link').value.trim() || todoDate);
}

function openDatePicker(input, anchor, value, onPick) {
  const r = anchor.getBoundingClientRect();
  input.style.left = `${r.left}px`;
  input.style.top = `${r.bottom}px`;
  input.value = value || '';
  input.onchange = () => onPick(input.value || null);
  try { input.showPicker(); } catch { input.focus(); }
}

$('#todo-form').addEventListener('focusin', () => setTodoOpen(true));
$('#todo-form').addEventListener('focusout', () => {
  // 폼 안에서 칸을 옮겨 다닐 때는 그대로, 밖으로 나가고 비어 있으면 접는다
  setTimeout(() => {
    if (todoPicking || $('#todo-form').contains(document.activeElement)) return;
    if (!todoHasDraft()) setTodoOpen(false);
  }, 120);
});
$('#todo-form').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#todo-input').value = '';
    $('#todo-link').value = '';
    todoDate = null;
    todoIgnoreParse = false;
    renderTodoExtra();
    document.activeElement?.blur();
    setTodoOpen(false);
  }
  // 링크 칸에서 Enter 도 바로 추가
  if (e.key === 'Enter' && e.target.id === 'todo-link') { e.preventDefault(); $('#todo-form').requestSubmit(); }
});
$('#todo-input').addEventListener('input', () => {
  if (!$('#todo-input').value.trim()) todoIgnoreParse = false;
  renderTodoExtra();
});
// 링크 칸에 문장째 붙여 넣어도 주소만 남긴다
$('#todo-link').addEventListener('input', renderTodoExtra);
$('#todo-link').addEventListener('change', () => {
  const v = $('#todo-link').value.trim();
  const m = v.match(URL_RE);
  if (m && m[0] !== v) { $('#todo-link').value = cleanUrl(m[0]) || v; renderTodoExtra(); }
});
$('#todo-date-btn').addEventListener('click', (e) => {
  todoPicking = true;
  openDatePicker($('#todo-date'), e.currentTarget, todoDraft().date, (v) => {
    todoDate = v;
    if (!v) todoIgnoreParse = true;
    renderTodoExtra();
    $('#todo-input').focus();
  });
  // 선택 창이 닫히면(고르든 취소하든) 다시 접을 수 있게
  setTimeout(() => { todoPicking = false; }, 400);
  $('#todo-date').addEventListener('blur', () => { todoPicking = false; }, { once: true });
});
$('#todo-date-clear').addEventListener('click', () => {
  todoDate = null;
  todoIgnoreParse = true;
  renderTodoExtra();
  $('#todo-input').focus();
});
$('#todo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = todoDraft();
  if (!d.text) { $('#todo-input').focus(); return; }
  if (d.badLink) { toast('링크는 http 또는 https 주소만 넣을 수 있어요', null, 'err'); $('#todo-link').focus(); return; }
  addTodo(d.text, d.date, d.url);
  $('#todo-input').value = '';
  $('#todo-link').value = '';
  todoDate = null;
  todoIgnoreParse = false;
  renderTodoExtra();
  $('#todo-input').focus(); // 연달아 입력할 수 있게 펼친 채로 둔다
});

function addTodo(text, date = null, url = null) {
  // 문장에 주소가 섞여 들어와도(빠른 입력·뭉치) 링크로 분리해 둔다
  const s = splitLink(text);
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: s.text, done: false, date, url: cleanUrl(url) || s.url };
  saveTodos([...config.todos, item]);
  return item;
}

// 목록의 날짜 배지를 누르면 날짜 바꾸기
function pickTodoDate(id, anchor) {
  const t = config.todos.find((x) => x.id === id);
  openDatePicker($('#todo-date-edit'), anchor, t?.date, (v) => {
    saveTodos(config.todos.map((x) => (x.id === id ? { ...x, date: v } : x)));
  });
}

// ───────────────────────── 뭉치의 등록 카드 ─────────────────────────

const ACTION_RE = /```mungchi-action\s*([\s\S]*?)```/g;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function stripActions(text) {
  return text.replace(ACTION_RE, '').replace(/```mungchi-action[\s\S]*$/, '').trim();
}

// 모델이 준 JSON 은 믿지 않고 형식을 다시 확인한다
function validateAction(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.type === 'event') {
    const title = String(a.title || '').trim().slice(0, 200);
    if (!title || !DAY_RE.test(a.date || '')) return null;
    const allDay = a.allDay === true || !TIME_RE.test(a.start || '');
    const start = allDay ? null : a.start;
    let end = allDay ? null : TIME_RE.test(a.end || '') ? a.end : fromMin(toMin(start) + 60);
    if (!allDay && toMin(end) <= toMin(start)) end = fromMin(toMin(start) + 60);
    return {
      type: 'event',
      input: { title, startDay: a.date, endDay: a.date, allDay, startTime: start || '09:00', endTime: end || '10:00', location: String(a.location || '').slice(0, 200), description: '', reminder: null },
    };
  }
  const id = String(a.id || '').trim();
  if (a.type === 'event_update' || a.type === 'event_delete') {
    const ev = cal.events.find((e) => e.gid === id);
    if (!ev) return { type: a.type, missing: true, label: '일정' };
    if (ev.editable === false) return { type: a.type, locked: true, label: ev.title };
    if (a.type === 'event_delete') return { type: a.type, id, before: ev };
    const before = eventToInput(ev);
    const after = { ...before };
    if (typeof a.title === 'string' && a.title.trim()) after.title = a.title.trim().slice(0, 200);
    if (DAY_RE.test(a.date || '')) { after.startDay = a.date; after.endDay = a.date; }
    if (typeof a.location === 'string') after.location = a.location.slice(0, 200);
    if (a.allDay === true) after.allDay = true;
    if (TIME_RE.test(a.start || '')) {
      const len = toMin(before.endTime) - toMin(before.startTime);
      after.allDay = false;
      after.startTime = a.start;
      after.endTime = TIME_RE.test(a.end || '') ? a.end : fromMin(toMin(a.start) + (len > 0 ? len : 60));
    } else if (TIME_RE.test(a.end || '')) after.endTime = a.end;
    if (!after.allDay && toMin(after.endTime) <= toMin(after.startTime)) after.endTime = fromMin(toMin(after.startTime) + 60);
    return { type: a.type, id, before, after };
  }
  if (['todo_done', 'todo_update', 'todo_delete'].includes(a.type)) {
    const t = config.todos.find((x) => x.id === id);
    if (!t) return { type: a.type, missing: true, label: '할 일' };
    const patch = {};
    if (a.type === 'todo_update') {
      if (typeof a.text === 'string' && a.text.trim()) patch.text = a.text.trim().slice(0, 200);
      if (a.date === null || DAY_RE.test(a.date || '')) patch.date = a.date || null;
      if (a.url === null || cleanUrl(a.url)) patch.url = a.url ? cleanUrl(a.url) : null;
    }
    return { type: a.type, id, before: t, patch };
  }
  if (a.type === 'memo') {
    const title = String(a.title || '').trim().slice(0, 200);
    const body = String(a.body || '').slice(0, 20000);
    if (!title && !body.trim()) return null;
    return { type: 'memo', title, body };
  }
  if (a.type === 'todo') {
    const text = String(a.text || '').trim().slice(0, 200);
    if (!text) return null;
    return { type: 'todo', text, date: DAY_RE.test(a.date || '') ? a.date : null, url: cleanUrl(a.url) };
  }
  return null;
}

function parseActions(text) {
  const out = [];
  for (const m of text.matchAll(ACTION_RE)) {
    try {
      const v = validateAction(JSON.parse(m[1].trim()));
      if (v) out.push(v);
    } catch { /* 형식이 틀린 블록은 버린다 */ }
  }
  return out;
}

function eventDiff(b, a) {
  const d = [];
  if (a.title !== b.title) d.push(`제목 “${b.title}” → “${a.title}”`);
  if (a.startDay !== b.startDay || a.allDay !== b.allDay || a.startTime !== b.startTime || a.endTime !== b.endTime) {
    // 같은 날 시간만 바뀌면 시간만 보여 준다
    const range = (r) => NL.describe(r).replace(/^.*?\)(?: · \S+)? /, '');
    d.push(a.startDay === b.startDay ? `${range(b)} → ${range(a)}` : `${NL.describe(b)} → ${NL.describe(a)}`);
  }
  if ((a.location || '') !== (b.location || '')) d.push(`장소 ${b.location || '없음'} → ${a.location || '없음'}`);
  return d.length ? d : ['바뀌는 내용이 없어요'];
}

const TODO_WHEN = (date) => (date ? `${NL.describe({ startDay: date, allDay: true }).replace(' 종일', '')}까지` : '날짜 없음');

function actionCardHtml(a, i) {
  const card = (ico, cls, title, sub, btns) => `<div class="act-card" data-i="${i}">
      <span class="act-ico ${cls}">${ico}</span>
      <div class="act-body"><div class="act-title">${title}</div><div class="act-sub">${sub}</div></div>
      <div class="act-btns">${btns}</div></div>`;
  if (a.missing || a.locked) {
    return card(ICON_CAL, 'warn', esc(a.label), a.locked ? '초대받은 일정이라 바꿀 수 없어요' : '대상을 찾지 못했어요 (이미 바뀌었거나 지워졌을 수 있어요)', '');
  }
  if (a.type === 'event_update') {
    return card(ICON_CAL, '', `일정 변경 · ${esc(a.before.title)}`, eventDiff(a.before, a.after).map(esc).join('<br>'),
      '<button class="btn sm" data-do="add">변경</button><button class="link" data-do="edit">수정</button>');
  }
  if (a.type === 'event_delete') {
    return card(ICON_CAL, 'danger', `일정 삭제 · ${esc(a.before.title)}`, esc(NL.describe(eventToInput(a.before))), '<button class="btn sm danger-solid" data-do="add">삭제</button>');
  }
  if (a.type === 'todo_done') {
    return card(ICON_TODO, 'todo', `완료 처리 · ${esc(a.before.text)}`, `할 일 · ${esc(TODO_WHEN(a.before.date))}`, '<button class="btn sm" data-do="add">완료</button>');
  }
  if (a.type === 'todo_update') {
    const d = [];
    if (a.patch.text && a.patch.text !== a.before.text) d.push(`“${a.before.text}” → “${a.patch.text}”`);
    if ('date' in a.patch && a.patch.date !== (a.before.date || null)) d.push(`${TODO_WHEN(a.before.date)} → ${TODO_WHEN(a.patch.date)}`);
    if ('url' in a.patch && a.patch.url !== (a.before.url || null)) d.push(a.patch.url ? `링크 → ${linkLabel(a.patch.url)}` : '링크 빼기');
    return card(ICON_TODO, 'todo', `할 일 변경 · ${esc(a.before.text)}`, (d.length ? d : ['바뀌는 내용이 없어요']).map(esc).join('<br>'), '<button class="btn sm" data-do="add">변경</button>');
  }
  if (a.type === 'todo_delete') {
    return card(ICON_TODO, 'danger', `할 일 삭제 · ${esc(a.before.text)}`, esc(TODO_WHEN(a.before.date)), '<button class="btn sm danger-solid" data-do="add">삭제</button>');
  }
  if (a.type === 'event') {
    const r = { ...a.input };
    return `<div class="act-card" data-i="${i}">
      <span class="act-ico">${ICON_CAL}</span>
      <div class="act-body"><div class="act-title">${esc(r.title)}</div>
        <div class="act-sub">${esc(NL.describe(r))}${r.location ? ` · ${esc(r.location)}` : ''}</div></div>
      <div class="act-btns"><button class="btn sm" data-do="add">등록</button><button class="link" data-do="edit">수정</button></div>
    </div>`;
  }
  if (a.type === 'memo') {
    const preview = a.body.replace(/\s+/g, ' ').trim().slice(0, 60);
    return `<div class="act-card" data-i="${i}">
      <span class="act-ico memo">${ICON_MEMO}</span>
      <div class="act-body"><div class="act-title">${esc(a.title || '제목 없는 메모')}</div><div class="act-sub">메모${preview ? ` · ${esc(preview)}` : ''}</div></div>
      <div class="act-btns"><button class="btn sm" data-do="add">저장</button></div>
    </div>`;
  }
  const when = a.date ? `${NL.describe({ startDay: a.date, allDay: true }).replace(' 종일', '')}까지` : '날짜 없음';
  return `<div class="act-card" data-i="${i}">
    <span class="act-ico todo">${ICON_TODO}</span>
    <div class="act-body"><div class="act-title">${esc(a.text)}</div><div class="act-sub">할 일 · ${esc(when)}</div></div>
    <div class="act-btns"><button class="btn sm" data-do="add">추가</button></div>
  </div>`;
}

function renderActionCards(bubble, text, { past = false } = {}) {
  const actions = parseActions(text);
  if (!actions.length) return;
  bubble._actions = actions;
  bubble.insertAdjacentHTML('beforeend', `<div class="act-list">${actions.map(actionCardHtml).join('')}</div>`);
  if (past) {
    // 이미 처리했을 수 있으므로 바로 등록하는 버튼은 숨기고, 일정은 "수정해서 등록"만 남긴다
    bubble.querySelectorAll('.act-card').forEach((card) => {
      const a = actions[Number(card.dataset.i)];
      card.classList.add('past');
      card.querySelector('.act-btns').innerHTML = a.type === 'event'
        ? '<span class="act-past">지난 제안</span><button class="link" data-do="edit">수정해서 등록</button>'
        : '<span class="act-past">지난 제안</span>';
    });
  }
  $('#ai-log').scrollTop = $('#ai-log').scrollHeight;
}

function setCardDone(card, msg, undo) {
  card.classList.add('done');
  card.querySelector('.act-btns').innerHTML = `<span class="act-ok">✓ ${esc(msg)}</span>${undo ? '<button class="link" data-do="undo">실행 취소</button>' : ''}`;
  card._undo = undo;
}

$('#ai-log').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-do]');
  const card = e.target.closest('.act-card');
  if (!btn || !card) return;
  const a = card.closest('.msg')?._actions?.[Number(card.dataset.i)];
  if (!a) return;
  const act = btn.dataset.do;

  if (act === 'undo') {
    await card._undo?.();
    card.classList.remove('done');
    card.outerHTML = actionCardHtml(a, card.dataset.i);
    return;
  }
  // 기존 항목 바꾸기: 처리 전 상태를 기억해 두었다가 실행 취소로 되돌린다
  if (a.type === 'event_update' && act === 'edit') {
    openComposer(a.after, { editGid: a.id });
    $('#sec-calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (a.type === 'event_update' && act === 'add') {
    btn.disabled = true;
    const ok = await updateGoogleEvent(a.id, a.after, { quiet: true });
    if (ok) setCardDone(card, '구글 캘린더에 반영했어요', () => updateGoogleEvent(a.id, a.before, { quiet: true }));
    else btn.disabled = false;
    return;
  }
  if (a.type === 'event_delete' && act === 'add') {
    btn.disabled = true;
    const ok = await deleteGoogleEvent(a.id, { quiet: true });
    if (ok) setCardDone(card, '삭제했어요', () => createGoogleEvent(eventToInput(a.before)));
    else btn.disabled = false;
    return;
  }
  if (['todo_done', 'todo_update', 'todo_delete'].includes(a.type) && act === 'add') {
    const snapshot = config.todos;
    if (a.type === 'todo_done') saveTodos(config.todos.map((t) => (t.id === a.id ? { ...t, done: true } : t)));
    if (a.type === 'todo_update') saveTodos(config.todos.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)));
    if (a.type === 'todo_delete') saveTodos(config.todos.filter((t) => t.id !== a.id));
    const msg = { todo_done: '완료 처리했어요', todo_update: '할 일을 바꿨어요', todo_delete: '할 일을 지웠어요' }[a.type];
    setCardDone(card, msg, () => saveTodos(snapshot));
    return;
  }
  if (a.type === 'memo' && act === 'add') {
    const m = await widget.memo.create({ title: a.title, body: a.body }, false);
    setCardDone(card, '메모에 저장했어요', () => widget.memo.remove(m.id));
    return;
  }
  if (a.type === 'todo' && act === 'add') {
    const item = addTodo(a.text, a.date, a.url);
    setCardDone(card, '할 일에 추가했어요', () => saveTodos(config.todos.filter((t) => t.id !== item.id)));
    return;
  }
  if (a.type === 'event' && act === 'edit') {
    openComposer(a.input);
    $('#sec-calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (a.type === 'event' && act === 'add') {
    if (!gcalState.connected) {
      openComposer(a.input);
      $('#sec-calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    btn.disabled = true;
    btn.textContent = '등록 중…';
    const created = await createGoogleEvent(a.input);
    if (created) setCardDone(card, '구글 캘린더에 등록했어요', () => deleteGoogleEvent(created.gid, { undo: true }));
    else { btn.disabled = false; btn.textContent = '다시 시도'; }
  }
});

// ───────────────────────── 설정: 구글 연결 ─────────────────────────

function renderGcalSettings() {
  const state = $('#gcal-state');
  const actions = $('#gcal-actions');
  if (!state) return;
  const s = gcalState;
  if (s.connecting) {
    state.innerHTML = '<span class="dot wait"></span>브라우저에서 구글 로그인을 마쳐 주세요…';
    actions.innerHTML = '';
    return;
  }
  if (s.connected) {
    state.innerHTML = `<span class="dot ok"></span><b>${esc(s.email || '연결됨')}</b> · 위젯에서 일정을 추가·수정·삭제하면 바로 반영돼요`;
    actions.innerHTML = '<button class="btn ghost" id="gcal-disconnect">연결 해제</button>';
    $('#gcal-guide').open = false;
  } else if (s.hasClient) {
    state.innerHTML = '<span class="dot"></span>준비 완료 · 구글 계정만 연결하면 돼요';
    actions.innerHTML = '<button class="btn" id="gcal-connect">구글 계정 연결</button><button class="btn ghost" id="gcal-import">JSON 다시 가져오기</button>';
  } else {
    state.innerHTML = '<span class="dot"></span>아직 연결 전이에요 · 아래 준비를 한 번만 해 주세요';
    actions.innerHTML = '<button class="btn" id="gcal-import">JSON 가져오기</button>';
    $('#gcal-guide').open = true;
  }
  $('#gcal-connect')?.addEventListener('click', connectGoogle);
  $('#gcal-disconnect')?.addEventListener('click', async () => {
    await widget.gcal.disconnect();
    await refreshGcal();
    toast('구글 캘린더 연결을 해제했어요');
    loadCalendar(true);
  });
  $('#gcal-import')?.addEventListener('click', async () => {
    const r = await widget.gcal.importClient();
    if (r.canceled) return;
    await refreshGcal();
    if (r.ok) toast('OAuth 클라이언트를 가져왔어요. 이제 구글 계정을 연결해 주세요');
    else toast(r.error, null, 'err');
  });
}

refreshGcal();

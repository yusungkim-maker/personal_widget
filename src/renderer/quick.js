// 빠른 입력창: 입력을 보고 일정 / 할 일 / 메모 / 뭉치 질문을 골라 처리한다.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = {
  event: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  memo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/></svg>',
};
const MODES = ['event', 'todo', 'memo', 'ask'];
const LABEL = { event: '일정', todo: '할 일', memo: '메모', ask: '뭉치에게' };

let manualMode = null;
let busy = false;

// 앞에 붙인 말로 종류를 정하고, 그 말은 떼어 낸다
function split(text) {
  const rules = [
    [/^(메모)\s*[:：]?\s+/, 'memo'], [/^(할\s*일|todo)\s*[:：]?\s+/i, 'todo'],
    [/^(일정)\s*[:：]?\s+/, 'event'], [/^[?？]\s*/, 'ask'], [/^뭉치[야아]?[,\s]+/, 'ask'],
  ];
  for (const [re, mode] of rules) if (re.test(text)) return { mode, body: text.replace(re, '').trim() };
  return { mode: null, body: text.trim() };
}

function detect(body) {
  if (!body) return 'event';
  const r = NL.parse(body);
  if (/까지/.test(body) && r.hasDate) return 'todo';
  if (r.hasTime || r.hasDate) return 'event';
  return 'todo';
}

function state() {
  const raw = $('#q-input').value;
  const { mode: prefixed, body } = split(raw);
  const mode = manualMode || prefixed || detect(body);
  return { mode, body, parsed: NL.parse(body) };
}

function render() {
  const { mode, body, parsed } = state();
  $('#q-ico').className = `q-ico ${mode}`;
  $('#q-ico').innerHTML = mode === 'ask' ? catAvatar(30) : ICONS[mode];
  $('#q-mode').textContent = manualMode ? `${LABEL[mode]} (직접 고름)` : `${LABEL[mode]} (자동)`;
  document.querySelectorAll('#q-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  const p = $('#q-preview');
  p.className = 'q-preview';
  if (!body) { p.innerHTML = ''; return; }
  if (mode === 'event') {
    p.innerHTML = parsed.title
      ? `<b>${esc(parsed.title)}</b> · ${esc(NL.describe(parsed))}${parsed.location ? ` · ${esc(parsed.location)}` : ''} → 구글 캘린더`
      : '제목을 적어 주세요';
    if (!parsed.title) p.classList.add('err');
  } else if (mode === 'todo') {
    const text = parsed.hasDate && parsed.title ? parsed.title : body;
    const when = parsed.hasDate ? `${NL.describe({ startDay: parsed.startDay, allDay: true }).replace(' 종일', '')}까지` : '날짜 없음';
    p.innerHTML = `<b>${esc(text)}</b> · ${esc(when)} → 할 일`;
  } else if (mode === 'memo') {
    p.innerHTML = `<b>${esc(body.split('\n')[0].slice(0, 60))}</b> → 새 메모`;
  } else {
    p.innerHTML = '뭉치에게 물어볼게요. 위젯에서 답이 나와요.';
  }
}

function done(msg) {
  const p = $('#q-preview');
  p.className = 'q-preview ok';
  p.textContent = `✓ ${msg}`;
  setTimeout(() => { busy = false; widget.quick.hide(); }, 650);
}

function fail(msg) {
  busy = false;
  const p = $('#q-preview');
  p.className = 'q-preview err';
  p.textContent = msg;
}

async function submit() {
  if (busy) return;
  const { mode, body, parsed } = state();
  if (!body) return;
  busy = true;
  if (mode === 'event') {
    if (!parsed.title) return fail('제목을 적어 주세요');
    const input = {
      title: parsed.title, startDay: parsed.startDay, endDay: parsed.endDay, allDay: parsed.allDay,
      startTime: parsed.startTime || '09:00', endTime: parsed.endTime || '10:00', location: parsed.location, description: '', reminder: null,
    };
    const st = await widget.gcal.status();
    if (!st.connected) {
      // 연결 전이면 위젯의 입력 화면으로 넘긴다
      await widget.quick.toWidget('compose', input);
      busy = false;
      widget.quick.hide();
      return;
    }
    $('#q-preview').textContent = '구글 캘린더에 추가하는 중…';
    const r = await widget.gcal.create(input);
    if (!r.ok) return fail(r.error);
    widget.quick.toWidget('refresh-calendar');
    return done(`구글 캘린더에 추가했어요 · ${NL.describe(parsed)}`);
  }
  if (mode === 'todo') {
    const text = parsed.hasDate && parsed.title ? parsed.title : body;
    await widget.quick.toWidget('todo', { text, date: parsed.hasDate ? parsed.startDay : null });
    return done('할 일에 추가했어요');
  }
  if (mode === 'memo') {
    await widget.memo.create({ title: '', body }, false);
    return done('메모에 저장했어요');
  }
  await widget.quick.toWidget('ask', body);
  busy = false;
  widget.quick.hide();
}

$('#q-input').addEventListener('input', render);
$('#q-input').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); widget.quick.hide(); }
  if (e.key === 'Enter') { e.preventDefault(); submit(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const cur = state().mode;
    manualMode = MODES[(MODES.indexOf(cur) + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length];
    render();
  }
});
$('#q-modes').addEventListener('mousedown', (e) => {
  const m = e.target.closest('[data-m]')?.dataset.m;
  if (!m) return;
  e.preventDefault(); // 입력창 포커스를 유지
  manualMode = m;
  render();
});

widget.quick.onOpen(async () => {
  busy = false;
  manualMode = null;
  $('#q-input').value = '';
  render();
  $('#q-input').focus();
  const c = await widget.getConfig();
  document.documentElement.dataset.theme = c.appearance.theme;
  document.documentElement.style.setProperty('--accent', c.appearance.accent);
});

render();

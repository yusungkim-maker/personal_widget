// 메모 팝업: 입력하는 대로 자동 저장
const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get('id');
const pad = (n) => String(n).padStart(2, '0');

let saveTimer = null;
let dirty = false;
let armed = false;

function setColor(c) {
  $('#note').className = `note ${c}`;
  document.querySelectorAll('#colors button').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
}

function when(t) {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  const hm = `${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
  return today ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function count() {
  $('#count').textContent = `${$('#body').value.length.toLocaleString()}자`;
}

function status(text) {
  $('#status').textContent = text;
}

async function flush() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  const m = await widget.memo.update(id, { title: $('#title').value, body: $('#body').value });
  if (m) status(`저장됨 · ${when(m.updatedAt)}`);
}

function schedule() {
  dirty = true;
  status('저장 중…');
  count();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 350);
}

$('#title').addEventListener('input', schedule);
$('#body').addEventListener('input', schedule);
$('#title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#body').focus(); }
});

$('#colors').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  setColor(c);
  widget.memo.update(id, { color: c });
});

$('#close').addEventListener('click', async () => { await flush(); widget.memo.closeSelf(); });
$('#del').addEventListener('click', () => {
  // 실수 방지: 한 번 더 눌러야 삭제
  if (!armed) {
    armed = true;
    $('#del').classList.add('armed');
    $('#confirm').hidden = false;
    setTimeout(() => { armed = false; $('#del').classList.remove('armed'); $('#confirm').hidden = true; }, 2500);
    return;
  }
  clearTimeout(saveTimer);
  widget.memo.remove(id);
});

document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') { await flush(); widget.memo.closeSelf(); }
  if (e.key === 's' && e.ctrlKey) { e.preventDefault(); await flush(); }
});
window.addEventListener('beforeunload', () => { if (dirty) widget.memo.update(id, { title: $('#title').value, body: $('#body').value }); });

// 다른 곳(위젯, 뭉치)에서 바뀌면 반영하고, 지워졌으면 창을 닫는다
widget.memo.onChanged((list) => {
  const m = list.find((x) => x.id === id);
  if (!m) return widget.memo.closeSelf();
  setColor(m.color);
  if (!dirty && document.activeElement !== $('#title')) $('#title').value = m.title;
  if (!dirty && document.activeElement !== $('#body')) $('#body').value = m.body;
  count();
});

(async function init() {
  const c = await widget.getConfig();
  document.documentElement.style.setProperty('--accent', c.appearance.accent);
  const m = await widget.memo.get(id);
  if (!m) return widget.memo.closeSelf();
  setColor(m.color);
  $('#title').value = m.title;
  $('#body').value = m.body;
  count();
  status(m.body || m.title ? `저장됨 · ${when(m.updatedAt)}` : '새 메모');
  if (!m.title && !m.body) $('#title').focus();
  else { const b = $('#body'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
})();

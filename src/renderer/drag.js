// 자석 끌기 (개인판): 잠금이 풀려 있을 때 카드 머리·시계 카드를 잡고 끈다.
// 처음 DRAG_THRESHOLD 만큼은 위젯이 살짝 당겨지기만 하고, 그 이상 끌면 떨어져 나와 따라온다.
// 놓으면 가장 가까운 모니터 모서리로 미끄러지듯 붙는다 (main.js snapTo).
const DRAG_THRESHOLD = 48;
const PULL = 0.14; // 붙어 있는 동안 따라오는 비율 (당겨지는 느낌)
let dragS = null;

const NO_DRAG = 'button, a, input, textarea, select, label, [contenteditable], .no-drag, .ev, .todo, .memo-item, .cal-day, .w-row, .msg';

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !config || config.window.locked) return;
  const zone = e.target.closest('.drag');
  if (!zone || e.target.closest(NO_DRAG)) return;
  dragS = { sx: e.screenX, sy: e.screenY, wx: null, wy: null, free: false };
  zone.setPointerCapture?.(e.pointerId);
  widget.drag.start().then((p) => {
    if (!dragS) return;
    if (!p) { dragS = null; return; }
    dragS.wx = p.x; dragS.wy = p.y;
  });
});

document.addEventListener('pointermove', (e) => {
  if (!dragS || dragS.wx == null) return;
  const dx = e.screenX - dragS.sx, dy = e.screenY - dragS.sy;
  if (!dragS.free) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      $('#app').style.transition = 'none';
      $('#app').style.transform = `translate(${dx * PULL}px, ${dy * PULL}px)`;
      return;
    }
    dragS.free = true; // 떨어져 나왔다
    $('#app').style.transform = '';
    document.body.classList.add('dragging');
  }
  widget.drag.move(dragS.wx + dx, dragS.wy + dy);
});

function endDrag() {
  if (!dragS) return;
  const moved = dragS.free;
  dragS = null;
  document.body.classList.remove('dragging');
  const app = $('#app');
  app.style.transition = 'transform .18s cubic-bezier(.2, .9, .3, 1.3)'; // 제자리로 톡 돌아온다
  app.style.transform = '';
  widget.drag.end(moved);
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// ⋯ 옆 자물쇠: 위치 잠금 켜기/끄기
const LOCK_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const LOCK_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"/></svg>';

function renderLockBtn() {
  const b = $('#btn-lock');
  if (!b || !config) return;
  const on = !!config.window.locked;
  b.innerHTML = on ? LOCK_ON : LOCK_OFF;
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? '위치 잠김 · 눌러서 풀기' : '잠금 풀림 · 끌어서 옮기면 가까운 모니터 모서리에 붙어요 (눌러서 잠그기)';
  b.classList.toggle('unlocked', !on);
}

$('#btn-lock').addEventListener('click', async () => {
  const locked = !config.window.locked;
  await patchConfig({ window: { locked } });
  renderLockBtn();
  toast(locked ? '위치를 잠갔어요' : '잠금을 풀었어요 · 끌어서 옮기면 가까운 모서리에 붙어요');
});

{
  const original = window.applyAppearance;
  window.applyAppearance = function (...args) { const r = original.apply(this, args); renderLockBtn(); return r; };
}
renderLockBtn();

// ⋯ 메뉴: 카드 머리의 글자 동작을 아이콘 하나 뒤로 모은다 (디자인 시스템 CardHeader)
const menuEl = $('#menu');
let menuAnchor = null;

function closeMenu() {
  menuEl.hidden = true;
  menuAnchor?.setAttribute('aria-expanded', 'false');
  menuAnchor = null;
}

// items: [{ label, onClick, checked?, hint?, danger? } | { sep: true } | { heading }]
function openMenu(anchor, items) {
  if (menuAnchor === anchor) return closeMenu();
  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  menuEl.innerHTML = items.map((it, i) => {
    if (it.sep) return '<div class="ms"></div>';
    if (it.heading) return `<div class="mh">${esc(it.heading)}</div>`;
    return `<button class="mi ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}"><span class="ck">${it.checked ? '✓' : ''}</span>${esc(it.label)}${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}</button>`;
  }).join('');
  menuEl.hidden = false;
  // 버튼 아래 오른쪽 정렬, 창 아래로 넘치면 위로
  const r = anchor.getBoundingClientRect();
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  menuEl.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
  menuEl.style.top = `${r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  menuEl.onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    closeMenu();
    it.onClick?.();
  };
  menuEl.querySelector('.mi')?.focus();
}

document.addEventListener('mousedown', (e) => { if (!menuEl.hidden && !menuEl.contains(e.target) && e.target.closest('[aria-haspopup]') !== menuAnchor) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menuEl.hidden) closeMenu(); });
window.addEventListener('blur', closeMenu);
$('#scroller').addEventListener('scroll', closeMenu);

// 처음 설정에서 "나중에" 한 항목 중 아직 안 된 것 (설정에서 채우면 저절로 빠진다)
const ONB_STEP = { weather: 3, calendar: 4, ai: 5, work: 6 };
function onbRemaining() {
  const left = config?.onboarding?.skipped || [];
  const done = {
    weather: () => config.weather.locations.length > 0,
    calendar: () => config.calendar.icalUrls.length > 0 || !!config.google?.email,
    ai: () => !!config.sections.ai,
    work: () => config.work?.state === 'ok' || !config.work?.enabled,
  };
  return left.filter((k) => ONB_STEP[k] && !(done[k]?.() ?? true));
}
function renderOnbDot() {
  const btn = $('#btn-clock-menu');
  if (!btn || !config) return;
  btn.classList.toggle('has-dot', onbRemaining().length > 0);
}

// 시계: 창 모드 · 컴팩트 모드 · 설정
$('#btn-clock-menu').addEventListener('click', (e) => {
  const mode = config.window.mode;
  const setMode = (m) => patchConfig({ window: { mode: m } });
  openMenu(e.currentTarget, [
    { heading: '창 모드' },
    { label: '바탕화면에 고정', hint: '위치 잠김', checked: mode === 'desktop', onClick: () => setMode('desktop') },
    { label: '일반 창', checked: mode === 'normal', onClick: () => setMode('normal') },
    { label: '항상 위에 표시', checked: mode === 'top', onClick: () => setMode('top') },
    { sep: true },
    { label: '컴팩트 모드 (시계와 오늘만)', checked: !!config.appearance.compact, onClick: () => $('#btn-compact').click() },
    { sep: true },
    ...(onbRemaining().length
      ? [{ label: `처음 설정 이어서 하기 (${onbRemaining().length}개 남음)`, onClick: () => widget.onb.open(ONB_STEP[onbRemaining()[0]]) }]
      : [{ label: '처음 설정 다시 하기', onClick: () => widget.onb.open(1) }]),
    { label: '설정', hint: '⚙', onClick: () => openSettings() },
  ]);
});

// 뭉치: 모델 고르기 · 새 대화
function aiModelLabel() {
  const opt = $('#ai-model').selectedOptions?.[0];
  $('#ai-model-label').textContent = opt && opt.value ? opt.textContent : '';
}
$('#ai-menu-btn').addEventListener('click', (e) => {
  const sel = $('#ai-model');
  const items = [];
  for (const g of sel.querySelectorAll('optgroup')) {
    items.push({ heading: g.label });
    for (const o of g.querySelectorAll('option')) items.push({ label: o.textContent, checked: o.value === sel.value, onClick: () => { sel.value = o.value; applyModel(o.value); aiModelLabel(); } });
  }
  if (!items.length) items.push({ label: '로그인이 필요해요 · 설정 열기', onClick: () => openSettings() });
  items.push({ sep: true }, { label: '새 대화', onClick: () => $('#ai-reset').click() });
  openMenu(e.currentTarget, items);
});
{
  const original = window.renderModelPicker;
  window.renderModelPicker = function (...args) { const r = original.apply(this, args); aiModelLabel(); return r; };
}

// 달력: 색 설명 보기
$('#cal-legend-btn').addEventListener('click', () => { cal.showLegend = !cal.showLegend; renderCalendar(); });

// 설정이 바뀔 때마다(다른 창에서 바꾼 것 포함) 남은 항목 표시를 맞춘다
{
  const original = window.applyAppearance;
  window.applyAppearance = function (...args) { const r = original.apply(this, args); renderOnbDot(); return r; };
}

// 처음 설정을 마치면 알림으로 알려 주고, 남은 항목이 있으면 어디서 이어서 하는지 알려 준다
const ONB_NAME = { weather: '날씨', calendar: '달력', ai: 'AI 비서', work: '업무 연동' };
widget.onb.onFinished(async (left) => {
  config = await widget.getConfig();
  renderOnbDot();
  const rest = (left || []).filter((k) => ONB_NAME[k]);
  try {
    const n = new Notification('설정을 마쳤어요', {
      body: rest.length ? `남은 ${rest.length}개(${rest.map((k) => ONB_NAME[k]).join(', ')})는 ⋯ 메뉴 → 처음 설정 이어서 하기에서 할 수 있어요.` : '이제 바탕화면에서 바로 쓰면 돼요.',
    });
    n.onclick = () => widget.showWidget();
  } catch { /* 알림을 쓸 수 없는 환경 */ }
});

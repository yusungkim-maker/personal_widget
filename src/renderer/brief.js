// 아침 브리핑: 하루 한 번, 정한 시각 이후 뭉치가 먼저 오늘을 요약해 준다.

const BRIEF_MARK = '[아침 브리핑]';
const BRIEF_PROMPT = `${BRIEF_MARK} 오늘 아침 브리핑을 해 줘.
- 오늘 날씨(우산·옷차림 등 챙길 것이 있으면 함께)
- 오늘 일정을 시간 순서로
- 오늘 마감이거나 기한이 지난 할 일
- 오늘 먼저 하면 좋을 일 하나
짧은 불릿 4~7줄로, 인사는 한 줄만. 등록 블록은 쓰지 마.`;

const briefCfg = () => ({ enabled: true, time: '08:30', last: '', ...(config.brief || {}) });
let briefRunning = false;

function dataReady() {
  return weatherData.length > 0 && !!cal.loadedRange;
}

async function runBrief({ manual = false } = {}) {
  if (briefRunning || streamingEl) return false;
  if (!aiStatus?.claude?.loggedIn && !aiStatus?.codex?.loggedIn) {
    if (manual) toast('뭉치가 로그인되어 있지 않아요. 설정 → AI 비서에서 로그인해 주세요', null, 'err');
    return false;
  }
  briefRunning = true;
  const today = ymd(new Date());
  config.brief = { ...briefCfg(), last: today };
  widget.updateConfig({ brief: config.brief });

  // 접혀 있으면 펼친다 (컴팩트 모드는 그대로 두고 알림으로 알려 준다)
  if (config.collapsed?.ai) {
    config.collapsed = { ...config.collapsed, ai: false };
    applyLayout();
    widget.updateConfig({ collapsed: config.collapsed });
  }
  $('#ai-log .ai-hello')?.remove();
  $('#ai-log').insertAdjacentHTML('beforeend', `<div class="chat-divider brief"><span>☀️ 아침 브리핑 · ${dayLabel(today)}</span></div>`);
  streamingText = '';
  streamingEl = addMsg('bot typing', '');
  $('#ai-send').textContent = '중지';

  const r = await widget.chat(BRIEF_PROMPT, aiContext());
  const el = streamingEl;
  streamingEl = null;
  el.classList.remove('typing');
  $('#ai-send').textContent = '전송';
  briefRunning = false;
  if (!r.ok) {
    el.classList.add('err');
    el.innerHTML = esc(r.aborted ? '브리핑을 멈췄어요.' : r.error);
    return false;
  }
  el.innerHTML = md(stripActions(streamingText));
  renderSummaries();
  // 알림: 첫 두 줄
  const lines = streamingText.split('\n').map((l) => l.replace(/^[\s*•-]+/, '').trim()).filter(Boolean);
  showNotification(`☀️ ${aiName()}의 아침 브리핑`, lines.slice(0, 3).join('\n'), `brief:${today}`);
  return true;
}

function checkBrief() {
  if (!config || !dataReady()) return;
  const b = briefCfg();
  if (!b.enabled) return;
  const now = new Date();
  const today = ymd(now);
  const [h, m] = b.time.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  // "아침" 브리핑이므로 정한 시각부터 정오 전까지만 자동으로 보낸다 (늦게 켰으면 건너뜀)
  const until = Math.max(12 * 60, h * 60 + m + 60);
  if (b.last !== today && mins >= h * 60 + m && mins < until) runBrief();
}

// ── 설정 ──
function fillBriefSettings() {
  const b = briefCfg();
  $('#set-brief').checked = b.enabled;
  $('#set-brief-time').value = b.time;
}
$('#set-brief').addEventListener('change', (e) => {
  config.brief = { ...briefCfg(), enabled: e.target.checked };
  widget.updateConfig({ brief: config.brief });
});
$('#set-brief-time').addEventListener('change', (e) => {
  if (!e.target.value) return;
  config.brief = { ...briefCfg(), time: e.target.value };
  widget.updateConfig({ brief: config.brief });
});
$('#brief-now').addEventListener('click', () => {
  closeSettings();
  runBrief({ manual: true });
});

setInterval(checkBrief, 60e3);
setTimeout(checkBrief, 15e3);

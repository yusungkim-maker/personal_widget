// 위젯의 "타자" 카드 (개인판): 평소엔 최고·오늘·최근 기록, [연습하기]를 누르면 카드 안에서 바로 친다.
// 큰 창은 카드 머리의 키보드 아이콘(크게 열기). 카드 안 연습과 큰 창은 같은 엔진·같은 기록을 쓴다.
const typingKey = (t) => `${t.mode}-${t.mode === 'time' ? t.time : t.words}-${t.lang}${t.punctuation ? '-p' : ''}${t.numbers ? '-n' : ''}`;
const typingLabel = (t) => `${t.mode === 'time' ? `${t.time}초` : `${t.words}단어`} · ${t.lang === 'korean' ? '한국어' : 'english'}`;
let typingInline = null; // 카드 안에서 치는 중이면 엔진

function renderTypingSummary(t = config.typing || {}) {
  const hist = t.history || [];
  const pb = (t.pb || {})[typingKey(t)];
  const today = new Date().toDateString();
  const todays = hist.filter((h) => new Date(h.at).toDateString() === today);
  $('#sum-typing').innerHTML = pb ? `최고 <b>${Math.round(pb.wpm)} wpm</b>${sep}${esc(typingLabel(t))}${todays.length ? `${sep}오늘 ${todays.length}판` : ''}` : `${esc(typingLabel(t))} 연습하기`;
  return { hist, pb, todays };
}

function renderTypingCard(t = config.typing || {}) {
  const box = $('#typing-body');
  if (!box) return;
  const { hist, pb, todays } = renderTypingSummary(t);
  if (typingInline) return; // 치는 중에는 화면을 바꾸지 않는다
  const avg = todays.length ? todays.reduce((s, h) => s + h.wpm, 0) / todays.length : 0;
  const last = hist[hist.length - 1];
  const tile = (label, value, sub) => `<div class="ty-tile"><span class="ty-l">${label}</span><span class="ty-v num">${value}</span><span class="ty-s">${sub}</span></div>`;
  box.innerHTML = `<div class="ty-tiles">
      ${tile('최고', pb ? Math.round(pb.wpm) : '–', pb ? `wpm · ${Math.round(pb.acc)}%` : '아직 기록 없음')}
      ${tile('오늘', todays.length ? Math.round(avg) : '–', todays.length ? `평균 · ${todays.length}판` : '오늘 첫 판을 쳐 봐요')}
      ${tile('최근', last ? Math.round(last.wpm) : '–', last ? `wpm · ${Math.round(last.acc)}%` : '')}
    </div>
    <button class="ty-start" id="typing-start">연습하기 <span>${esc(typingLabel(t))}</span></button>`;
  $('#typing-start').onclick = openTypingInline;
}

// 카드 안에서 연습 시작
function openTypingInline() {
  const box = $('#typing-body');
  if (typingInline) return typingInline.focus();
  // 접혀 있으면 펼친다
  if (config.collapsed?.typing) {
    config.collapsed = { ...config.collapsed, typing: false };
    applyLayout();
    widget.updateConfig({ collapsed: config.collapsed });
  }
  box.innerHTML = `<div class="ty-inline"></div>
    <div class="ty-foot"><span><kbd>tab</kbd> 다시</span><span><kbd>esc</kbd> 닫기</span><button class="link" id="typing-close">기록 보기</button></div>`;
  typingInline = createTypingTest(box.querySelector('.ty-inline'), { compact: true, onClose: closeTypingInline });
  $('#typing-close').onclick = closeTypingInline;
  $('#sec-typing').classList.add('typing-on');
}

function closeTypingInline() {
  if (!typingInline) return;
  typingInline.destroy();
  typingInline = null;
  $('#sec-typing').classList.remove('typing-on');
  renderTypingCard();
}

// 카드 머리 키보드 아이콘 = 큰 창 (카드 안에서 치던 건 닫는다)
$('#typing-open').addEventListener('click', () => { closeTypingInline(); widget.typing.open(); });
widget.typing.onChanged((t) => { config.typing = t; renderTypingCard(t); });

{
  const original = window.applyAppearance;
  window.applyAppearance = function (...args) { const r = original.apply(this, args); renderTypingCard(); return r; };
}
if (typeof config !== 'undefined' && config) renderTypingCard();

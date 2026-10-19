// 위젯의 "타자" 카드 (개인판): 지금 종목 최고 기록, 오늘 기록, 최근 기록 + 연습 창 열기
const typingKey = (t) => `${t.mode}-${t.mode === 'time' ? t.time : t.words}-${t.lang}${t.punctuation ? '-p' : ''}${t.numbers ? '-n' : ''}`;
const typingLabel = (t) => `${t.mode === 'time' ? `${t.time}초` : `${t.words}단어`} · ${t.lang === 'korean' ? '한국어' : 'english'}`;

function renderTypingCard(t = config.typing || {}) {
  const box = $('#typing-body');
  if (!box) return;
  const hist = t.history || [];
  const pb = (t.pb || {})[typingKey(t)];
  const today = new Date().toDateString();
  const todays = hist.filter((h) => new Date(h.at).toDateString() === today);
  const avg = todays.length ? todays.reduce((s, h) => s + h.wpm, 0) / todays.length : 0;
  const last = hist[hist.length - 1];
  const tile = (label, value, sub) => `<div class="ty-tile"><span class="ty-l">${label}</span><span class="ty-v num">${value}</span><span class="ty-s">${sub}</span></div>`;
  box.innerHTML = `<div class="ty-tiles">
      ${tile('최고', pb ? Math.round(pb.wpm) : '–', pb ? `wpm · ${Math.round(pb.acc)}%` : '아직 기록 없음')}
      ${tile('오늘', todays.length ? Math.round(avg) : '–', todays.length ? `평균 · ${todays.length}판` : '오늘 첫 판을 쳐 봐요')}
      ${tile('최근', last ? Math.round(last.wpm) : '–', last ? `wpm · ${Math.round(last.acc)}%` : '')}
    </div>
    <button class="ty-start" id="typing-start">연습하기 <span>${esc(typingLabel(t))}</span></button>`;
  $('#typing-start').onclick = () => widget.typing.open();
  $('#sum-typing').innerHTML = pb ? `최고 <b>${Math.round(pb.wpm)} wpm</b>${sep}${esc(typingLabel(t))}${todays.length ? `${sep}오늘 ${todays.length}판` : ''}` : `${esc(typingLabel(t))} 연습하기`;
}

$('#typing-open').addEventListener('click', () => widget.typing.open());
widget.typing.onChanged((t) => { config.typing = t; renderTypingCard(t); });

// 설정이 바뀌거나(다른 창) 위젯이 다시 그려질 때도 맞춘다
{
  const original = window.applyAppearance;
  window.applyAppearance = function (...args) { const r = original.apply(this, args); renderTypingCard(); return r; };
}
if (typeof config !== 'undefined' && config) renderTypingCard();

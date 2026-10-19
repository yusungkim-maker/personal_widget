// 타자 연습 — 몽키타입처럼: 시간/단어 모드, 맞음·틀림·남는 글자 색, 부드러운 커서, 3줄 스크롤,
// 결과(wpm·raw·acc·consistency·글자 통계·초당 그래프)와 최고 기록. 한글은 조합 중인 글자를 틀림으로 보지 않는다.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const AMOUNTS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };
const TIME_BUFFER = 60;   // 시간 모드: 남은 단어가 이만큼보다 적어지면 더 붙인다
let cfg = { mode: 'time', time: 30, words: 25, lang: 'english', punctuation: false, numbers: false };
let st = null;            // 지금 시험 상태
let lastWords = [];       // "같은 단어로 다시"

const hid = $('#hid');
const wordsEl = $('#words');
const caret = $('#caret');

// ───────────── 단어 만들기 ─────────────
function makeWords(n, state = { capNext: true, prev: '' }) {
  const list = window.TYPING_WORDS[cfg.lang] || window.TYPING_WORDS.english;
  const out = [];
  for (let i = 0; i < n; i++) {
    let w;
    do { w = list[Math.floor(Math.random() * list.length)]; } while (w === state.prev && list.length > 1);
    state.prev = w;
    if (cfg.numbers && Math.random() < 0.1) w = String(Math.floor(Math.random() * 10 ** (1 + Math.floor(Math.random() * 4))));
    if (cfg.punctuation) {
      if (cfg.lang === 'english' && state.capNext && /^[a-z]/.test(w)) w = w[0].toUpperCase() + w.slice(1);
      state.capNext = false;
      const r = Math.random();
      if (r < 0.08) { w += '.'; state.capNext = true; }
      else if (r < 0.16) w += ',';
      else if (r < 0.18) { w += '?'; state.capNext = true; }
      else if (r < 0.20) { w += '!'; state.capNext = true; }
      else if (cfg.lang === 'english' && r < 0.22) w = `"${w}"`;
      else if (cfg.lang === 'english' && r < 0.23) w = `(${w})`;
      else if (cfg.lang === 'english' && r < 0.25) w += ';';
    }
    out.push(w);
  }
  if (cfg.punctuation && cfg.mode === 'words' && out.length && !/[.?!]$/.test(out[out.length - 1])) out[out.length - 1] += '.';
  return out;
}

// ───────────── 그리기 ─────────────
function wordHtml(i) {
  const w = st.words[i];
  const t = i < st.wi ? st.typed[i] : i === st.wi ? st.cur : '';
  const isCur = i === st.wi;
  let html = '';
  const len = Math.max(w.length, t.length);
  for (let j = 0; j < len; j++) {
    if (j >= w.length) { html += `<span class="letter extra">${esc(t[j])}</span>`; continue; }
    let cls = '';
    if (j < t.length) {
      // 한글 조합 중인 마지막 글자는 아직 판정하지 않는다
      if (isCur && st.composing && j === t.length - 1) cls = 'composing';
      else cls = t[j] === w[j] ? 'correct' : 'incorrect';
    }
    html += `<span class="letter ${cls}">${esc(w[j])}</span>`;
  }
  const err = i < st.wi && t !== w;
  return `<div class="word${err ? ' error' : ''}${/[가-힣]/.test(w) ? ' korean' : ''}" data-i="${i}">${html}</div>`;
}

function renderAll() {
  wordsEl.innerHTML = st.words.map((_, i) => wordHtml(i)).join('');
  st.shift = 0;
  wordsEl.style.transform = '';
  updateCaret();
}

function renderWord(i) {
  const el = wordsEl.children[i];
  if (!el) return;
  el.outerHTML = wordHtml(i);
}

function appendWords(n) {
  const from = st.words.length;
  st.words.push(...makeWords(n, st.gen));
  wordsEl.insertAdjacentHTML('beforeend', st.words.slice(from).map((_, k) => wordHtml(from + k)).join(''));
}

// 커서: 다음에 칠 글자 앞 (단어 끝이면 마지막 글자 뒤). 세 번째 줄로 넘어가면 한 줄 올린다.
function updateCaret() {
  const wordEl = wordsEl.children[st.wi];
  if (!wordEl) return;
  const lineH = parseFloat(getComputedStyle(wordsEl).lineHeight);
  const top = wordEl.offsetTop;
  if (top - st.shift >= lineH * 2) st.shift = top - lineH;
  else if (top - st.shift < 0) st.shift = Math.max(0, top - lineH);
  wordsEl.style.transform = `translateY(${-st.shift}px)`;
  const letters = wordEl.children;
  let x, y;
  if (st.cur.length < letters.length) { const l = letters[st.cur.length]; x = l.offsetLeft; y = l.offsetTop; }
  else { const l = letters[letters.length - 1]; x = l.offsetLeft + l.offsetWidth; y = l.offsetTop; }
  const ch = caret.offsetHeight;
  caret.style.left = `${x - 1}px`;
  caret.style.top = `${y - st.shift + (lineH - ch) / 2}px`;
}

// 치는 동안 커서는 깜빡이지 않고, 1초 쉬면 깜빡인다
let idleTimer = null;
function markTyping() {
  caret.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => caret.classList.add('idle'), 1000);
}

// ───────────── 시험 진행 ─────────────
function newTest(sameWords = false) {
  if (st?.timer) clearInterval(st.timer);
  const n = cfg.mode === 'words' ? cfg.words : 100;
  const gen = { capNext: true, prev: '' };
  const words = sameWords && lastWords.length ? [...lastWords] : makeWords(n, gen);
  lastWords = [...words];
  st = {
    words, typed: [], cur: '', wi: 0, composing: false, gen,
    started: false, ended: false, start: 0, shift: 0, timer: null,
    keys: { correct: 0, incorrect: 0 }, secRaw: 0, secErr: 0, samples: [],
  };
  document.body.classList.remove('typing');
  $('#result').hidden = true;
  $('#test').hidden = false;
  $('.hint').hidden = false;
  hid.value = '';
  renderAll();
  updateCounter();
  $('#livewpm').textContent = '';
  focusInput();
}

function startTest() {
  st.started = true;
  st.start = performance.now();
  document.body.classList.add('typing'); // 시험 중엔 설정 줄·안내를 숨긴다
  st.timer = setInterval(tick, 1000);
}

// 1초마다: 그 1초 동안의 raw 속도, 지금까지의 wpm, 틀린 수를 기록
function tick() {
  const sec = (performance.now() - st.start) / 1000;
  st.samples.push({ raw: st.secRaw * 12, wpm: wpmSoFar(sec), err: st.secErr });
  st.secRaw = 0;
  st.secErr = 0;
  updateCounter(sec);
  $('#livewpm').textContent = `${Math.round(wpmSoFar(sec))}`;
  if (cfg.mode === 'time' && sec >= cfg.time - 0.05) finish();
}

function updateCounter(sec = 0) {
  $('#counter').textContent = cfg.mode === 'time'
    ? (st.started ? Math.max(0, Math.round(cfg.time - sec)) : cfg.time)
    : `${st.wi}/${st.words.length}`;
}

// 글자 통계 (몽키타입과 같은 기준)
function charStats(final) {
  let correctWordChars = 0, correct = 0, incorrect = 0, extra = 0, missed = 0, rawChars = 0;
  for (let i = 0; i < st.wi; i++) {
    const t = st.typed[i], w = st.words[i];
    if (t === w) correctWordChars += w.length + 1; // 맞게 친 단어 + 뒤 공백
    rawChars += t.length + 1;
    for (let j = 0; j < Math.max(w.length, t.length); j++) {
      if (j >= w.length) extra++;
      else if (j >= t.length) missed++;
      else if (t[j] === w[j]) correct++;
      else incorrect++;
    }
  }
  // 치고 있던 마지막 단어: 맞게 친 앞부분만 속도에 넣고, 덜 친 글자는 빠진 글자로 세지 않는다
  const w = st.words[st.wi] || '', t = st.cur;
  rawChars += t.length;
  let prefixOk = true;
  for (let j = 0; j < t.length; j++) {
    if (j >= w.length) { extra++; prefixOk = false; }
    else if (t[j] === w[j]) correct++;
    else { incorrect++; prefixOk = false; }
  }
  if (final && prefixOk) correctWordChars += t.length;
  else if (!final && prefixOk) correctWordChars += t.length;
  return { correctWordChars, correct, incorrect, extra, missed, rawChars };
}

function wpmSoFar(sec) {
  if (sec <= 0) return 0;
  return (charStats(false).correctWordChars / 5) / (sec / 60);
}

function setCurrent(v, composing) {
  if (st.ended) return;
  if (!st.started && v.length) startTest();
  const before = st.cur;
  // 새로 친 글자 판정 (조합 중이면 확정될 때 판정)
  if (!composing && v.length > before.length) {
    const w = st.words[st.wi] || '';
    for (let j = before.length; j < v.length; j++) {
      if (j < w.length && v[j] === w[j]) st.keys.correct++;
      else { st.keys.incorrect++; st.secErr++; }
      st.secRaw++;
    }
  }
  st.cur = v;
  st.composing = !!composing;
  renderWord(st.wi);
  updateCaret();
  markTyping();
  // 단어 모드: 마지막 단어를 맞게 다 치면 바로 끝 (공백 필요 없음)
  if (cfg.mode === 'words' && st.wi === st.words.length - 1 && !composing && v === st.words[st.wi]) commitWord();
}

function commitWord() {
  const w = st.words[st.wi];
  const ok = st.cur === w;
  if (ok) st.keys.correct++; else { st.keys.incorrect++; st.secErr++; }
  st.secRaw++;
  st.typed[st.wi] = st.cur;
  st.cur = '';
  st.composing = false;
  hid.value = '';
  st.wi++;
  renderWord(st.wi - 1); // 친 단어: 맞음·틀림 색과 밑줄로 확정
  if (cfg.mode === 'words' && st.wi >= st.words.length) { finish(); return; }
  if (cfg.mode === 'time' && st.words.length - st.wi < TIME_BUFFER) appendWords(TIME_BUFFER);
  renderWord(st.wi);
  updateCounter((performance.now() - st.start) / 1000);
  updateCaret();
}

// 앞 단어로 돌아가기: 틀린 단어일 때만 (맞게 친 단어는 그대로 둔다)
function backWord(clear) {
  if (st.wi === 0) return;
  const p = st.wi - 1;
  if (st.typed[p] === st.words[p]) return;
  st.wi = p;
  st.cur = clear ? '' : st.typed[p];
  st.typed.length = p;
  hid.value = st.cur;
  renderWord(p);
  renderWord(p + 1);
  updateCaret();
  updateCounter(st.started ? (performance.now() - st.start) / 1000 : 0);
}

async function finish() {
  if (st.ended) return;
  st.ended = true;
  clearInterval(st.timer);
  const sec = cfg.mode === 'time' ? cfg.time : (performance.now() - st.start) / 1000;
  // 끝나기 전 남은 조각(1초 미만)도 그래프에 넣는다
  const frac = sec - st.samples.length;
  if (frac > 0.3) st.samples.push({ raw: (st.secRaw / frac) * 12, wpm: 0, err: st.secErr });
  const c = charStats(true);
  const min = Math.max(sec, 0.001) / 60;
  const wpm = (c.correctWordChars / 5) / min;
  const raw = (c.rawChars / 5) / min;
  const keys = st.keys.correct + st.keys.incorrect;
  const acc = keys ? (st.keys.correct / keys) * 100 : 0;
  if (st.samples.length) st.samples[st.samples.length - 1].wpm = wpm;
  const raws = st.samples.map((s) => s.raw);
  const mean = raws.reduce((a, b) => a + b, 0) / Math.max(1, raws.length);
  const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, raws.length));
  const cov = mean ? sd / mean : 1;
  const consistency = Math.max(0, 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5)));
  const result = {
    mode: cfg.mode, amount: cfg.mode === 'time' ? cfg.time : cfg.words, lang: cfg.lang,
    punctuation: cfg.punctuation, numbers: cfg.numbers,
    wpm: +wpm.toFixed(2), raw: +raw.toFixed(2), acc: +acc.toFixed(2), consistency: +consistency.toFixed(2),
    chars: { correct: c.correct, incorrect: c.incorrect, extra: c.extra, missed: c.missed }, dur: +sec.toFixed(2),
  };
  showResult(result);
  // 너무 짧거나 거의 안 친 시험은 기록하지 않는다
  if (sec >= 5 && c.rawChars >= 10) {
    const r = await widget.typing.result(result);
    $('#r-pb').hidden = !r?.isPb;
  }
}

function showResult(r) {
  document.body.classList.remove('typing');
  $('#test').hidden = true;
  $('#result').hidden = false;
  $('#r-pb').hidden = true;
  $('#r-wpm').textContent = Math.round(r.wpm);
  $('#r-acc').textContent = `${Math.round(r.acc)}%`;
  $('#r-wpm').title = `${r.wpm.toFixed(2)} wpm`;
  $('#r-acc').title = `${r.acc.toFixed(2)}%`;
  $('#r-type').textContent = `${r.mode} ${r.amount} ${r.lang}${r.punctuation ? ' · 문장부호' : ''}${r.numbers ? ' · 숫자' : ''}`;
  $('#r-raw').textContent = Math.round(r.raw);
  $('#r-chars').textContent = `${r.chars.correct}/${r.chars.incorrect}/${r.chars.extra}/${r.chars.missed}`;
  $('#r-cons').textContent = `${Math.round(r.consistency)}%`;
  $('#r-time').textContent = `${Math.round(r.dur)}s`;
  drawChart();
  $('#next').focus();
}

// 초당 그래프: 노란 선 = wpm(누적), 회색 선 = raw(그 1초), 빨간 × = 틀린 글자
function drawChart() {
  const cv = $('#chart');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const s = st.samples;
  if (!s.length) return;
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const pad = { l: 36, r: 10, t: 10, b: 22 };
  const maxV = Math.max(10, ...s.map((p) => Math.max(p.raw, p.wpm))) * 1.15;
  const X = (i) => pad.l + (s.length === 1 ? 0 : (i / (s.length - 1)) * (W - pad.l - pad.r));
  const Y = (v) => H - pad.b - (v / maxV) * (H - pad.t - pad.b);
  g.font = '11px Consolas, monospace';
  g.fillStyle = col('--sub');
  g.strokeStyle = col('--sub-alt');
  g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = (maxV / 4) * k, y = Y(v);
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke();
    g.fillText(String(Math.round(v)), 4, y + 4);
  }
  const step = Math.max(1, Math.ceil(s.length / 10));
  for (let i = 0; i < s.length; i += step) g.fillText(String(i + 1), X(i) - 3, H - 6);
  const line = (key, color, width) => {
    g.strokeStyle = color; g.lineWidth = width; g.beginPath();
    s.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[key])) : g.moveTo(X(i), Y(p[key]))));
    g.stroke();
  };
  line('raw', col('--sub'), 2);
  line('wpm', col('--main'), 3);
  g.strokeStyle = col('--error'); g.lineWidth = 2;
  s.forEach((p, i) => {
    if (!p.err) return;
    const x = X(i), y = Y(p.raw), d = 4;
    g.beginPath(); g.moveTo(x - d, y - d); g.lineTo(x + d, y + d); g.moveTo(x + d, y - d); g.lineTo(x - d, y + d); g.stroke();
  });
}

// ───────────── 입력 ─────────────
function focusInput() {
  hid.focus();
  document.body.classList.toggle('unfocused', document.activeElement !== hid);
}

hid.addEventListener('compositionstart', () => { st.composing = true; });
hid.addEventListener('compositionend', () => {
  // 확정된 글자를 판정한다
  if (st.ended) return;
  const v = hid.value.replace(/ .*$/, '');
  const w = st.words[st.wi] || '';
  const j = v.length - 1;
  if (j >= 0) {
    if (j < w.length && v[j] === w[j]) st.keys.correct++; else { st.keys.incorrect++; st.secErr++; }
    st.secRaw++;
  }
  st.composing = false;
  st.cur = v;
  renderWord(st.wi);
  updateCaret();
});

hid.addEventListener('input', (e) => {
  if (st.ended) return;
  const v = hid.value;
  // 한글 입력 중 공백이 들어오면(조합 확정 + 공백) 그 앞까지를 단어로 확정
  if (v.includes(' ')) {
    const word = v.slice(0, v.indexOf(' '));
    if (word !== st.cur) setCurrent(word, false);
    if (st.cur.length) commitWord(); else hid.value = '';
    return;
  }
  setCurrent(v, e.isComposing || st.composing);
});

hid.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); newTest(false); return; }
  if (e.key === 'Escape') { e.preventDefault(); widget.closeSelf(); return; }
  if (st.ended) return;
  const composing = e.isComposing || e.keyCode === 229;
  if (e.key === ' ' && !composing) {
    e.preventDefault();
    if (st.cur.length) commitWord();
    return;
  }
  if (e.key === 'Backspace' && !composing) {
    if (e.ctrlKey) { e.preventDefault(); if (st.cur.length) { hid.value = ''; setCurrent('', false); } else backWord(true); return; }
    if (!st.cur.length) { e.preventDefault(); backWord(false); }
  }
  if (e.key === 'Enter') e.preventDefault();
});

hid.addEventListener('blur', () => document.body.classList.add('unfocused'));
hid.addEventListener('focus', () => document.body.classList.remove('unfocused'));
$('#wordsWrap').addEventListener('mousedown', (e) => { e.preventDefault(); focusInput(); });

// 결과 화면·바깥에서 누른 키
document.addEventListener('keydown', (e) => {
  if (document.activeElement === hid) return;
  if (e.key === 'Escape') { e.preventDefault(); widget.closeSelf(); return; }
  if (e.key === 'Tab') { e.preventDefault(); newTest(false); return; }
  if (!$('#result').hidden) return; // 결과 화면에서는 버튼(Enter)으로
  if (e.key.length === 1 || e.key === 'Backspace') focusInput();
});

$('#restart').addEventListener('click', () => newTest(false));
$('#next').addEventListener('click', () => newTest(false));
$('#again').addEventListener('click', () => newTest(true));
$('#close').addEventListener('click', () => widget.closeSelf());
window.addEventListener('resize', () => { if (!$('#result').hidden) drawChart(); else updateCaret(); });

// ───────────── 설정 줄 ─────────────
function renderConfig() {
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === cfg.mode));
  $$('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === cfg.lang));
  $$('[data-toggle]').forEach((b) => b.classList.toggle('on', !!cfg[b.dataset.toggle]));
  const cur = cfg.mode === 'time' ? cfg.time : cfg.words;
  $('#amounts').innerHTML = AMOUNTS[cfg.mode].map((n) => `<button data-amount="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`).join('');
}

async function setCfg(patch) {
  cfg = { ...cfg, ...patch };
  renderConfig();
  newTest(false);
  try { await widget.typing.settings(patch); } catch { /* 저장 실패해도 진행 */ }
}

$('#config').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mode) setCfg({ mode: b.dataset.mode });
  else if (b.dataset.lang) setCfg({ lang: b.dataset.lang });
  else if (b.dataset.toggle) setCfg({ [b.dataset.toggle]: !cfg[b.dataset.toggle] });
  else if (b.dataset.amount) setCfg(cfg.mode === 'time' ? { time: Number(b.dataset.amount) } : { words: Number(b.dataset.amount) });
});

(async () => {
  try {
    const t = await widget.typing.get();
    cfg = { ...cfg, ...Object.fromEntries(Object.entries(t || {}).filter(([k]) => k in cfg)) };
  } catch { /* 기본값 */ }
  renderConfig();
  newTest(false);
})();

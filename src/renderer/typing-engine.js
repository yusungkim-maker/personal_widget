// 타자 연습 엔진 — 몽키타입처럼: 시간/단어 모드, 맞음·틀림·남는 글자 색, 부드러운 커서, 3줄 스크롤,
// 결과(wpm·raw·acc·consistency·글자 통계·초당 그래프)와 최고 기록. 한글은 조합 중인 글자를 틀림으로 보지 않는다.
// 큰 창(typing.html)과 위젯 카드(typing-card.js)가 같은 엔진을 쓴다: createTypingTest(root, { compact, onClose })
(function () {
  const escT = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AMOUNTS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };
  const TIME_BUFFER = 60; // 시간 모드: 남은 단어가 이만큼보다 적어지면 더 붙인다
  const ICON_RESTART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  window.createTypingTest = function createTypingTest(root, opts = {}) {
    const compact = !!opts.compact;
    root.classList.add('mt');
    root.classList.toggle('compact', compact);
    root.innerHTML = `
      <nav class="mt-config" aria-label="테스트 설정">
        <div class="mt-grp"><button data-toggle="punctuation">@ ${compact ? '' : '문장부호'}</button><button data-toggle="numbers"># ${compact ? '' : '숫자'}</button></div>
        <span class="mt-bar"></span>
        <div class="mt-grp"><button data-mode="time">${compact ? '시간' : '⏱ 시간'}</button><button data-mode="words">${compact ? '단어' : 'A 단어'}</button></div>
        <span class="mt-bar"></span>
        <div class="mt-grp mt-amounts"></div>
        <span class="mt-bar"></span>
        <div class="mt-grp"><button data-lang="english">${compact ? 'en' : 'english'}</button><button data-lang="korean">${compact ? '한' : '한국어'}</button></div>
      </nav>
      <div class="mt-test">
        <div class="mt-live"><span class="mt-counter"></span><span class="mt-livewpm"></span></div>
        <div class="mt-wrap">
          <div class="mt-words"></div>
          <div class="mt-caret"></div>
          <div class="mt-blur">${compact ? '눌러서 시작' : '여기를 누르거나 아무 키나 눌러 시작해요'}</div>
        </div>
        <input class="mt-hid" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="타자 입력">
        <button class="mt-restart" title="다시 시작 (Tab)" aria-label="다시 시작">${ICON_RESTART}</button>
      </div>
      <section class="mt-result" hidden>
        <div class="mt-res-top">
          <div class="mt-big">
            <div class="mt-stat"><span class="lbl">wpm</span><span class="val" data-r="wpm"></span></div>
            <div class="mt-stat"><span class="lbl">acc</span><span class="val" data-r="acc"></span></div>
            <div class="mt-pb" hidden>👑 최고 기록</div>
          </div>
          <canvas class="mt-chart" aria-label="초당 속도 그래프"></canvas>
        </div>
        <div class="mt-more">
          <div class="mt-stat sm"><span class="lbl">test</span><span class="val" data-r="type"></span></div>
          <div class="mt-stat sm"><span class="lbl">raw</span><span class="val" data-r="raw"></span></div>
          <div class="mt-stat sm"><span class="lbl">chars</span><span class="val" data-r="chars" title="맞음 / 틀림 / 남는 글자 / 빠진 글자"></span></div>
          <div class="mt-stat sm"><span class="lbl">consistency</span><span class="val" data-r="cons"></span></div>
          <div class="mt-stat sm"><span class="lbl">time</span><span class="val" data-r="time"></span></div>
        </div>
        <div class="mt-actions">
          <button data-act="next" title="다음 테스트 (Tab)">${ICON_NEXT}다음</button>
          <button data-act="again" title="같은 단어로 다시">${ICON_RESTART}같은 단어로</button>
        </div>
      </section>`;

    const q = (s) => root.querySelector(s);
    const qa = (s) => [...root.querySelectorAll(s)];
    const hid = q('.mt-hid'), wordsEl = q('.mt-words'), caret = q('.mt-caret');
    let cfg = { mode: 'time', time: 30, words: 25, lang: 'english', punctuation: false, numbers: false };
    let st = null;
    let lastWords = [];
    let idleTimer = null;
    let destroyed = false;

    // ───────────── 단어 만들기 ─────────────
    function makeWords(n, state) {
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
      for (let j = 0; j < Math.max(w.length, t.length); j++) {
        if (j >= w.length) { html += `<span class="letter extra">${escT(t[j])}</span>`; continue; }
        // 한글 조합 중인 글자는 친 그대로(ㄱ → 가 → 간) 보여 주고, 목표로 가는 중이 아니면 빨갛게
        if (isCur && st.composing && j === t.length - 1) {
          const ok = window.TypingHangul ? TypingHangul.composingOk(t[j], w.slice(j)) : t[j] === w[j];
          html += `<span class="letter composing${ok ? '' : ' bad'}">${escT(t[j])}</span>`;
          continue;
        }
        const cls = j < t.length ? (t[j] === w[j] ? 'correct' : 'incorrect') : '';
        html += `<span class="letter ${cls}">${escT(w[j])}</span>`;
      }
      const err = i < st.wi && t !== w;
      return `<div class="word${err ? ' error' : ''}${/[가-힣]/.test(w) ? ' korean' : ''}">${html}</div>`;
    }
    function renderAll() {
      wordsEl.innerHTML = st.words.map((_, i) => wordHtml(i)).join('');
      st.shift = 0;
      wordsEl.style.transform = '';
      updateCaret();
    }
    function renderWord(i) { const el = wordsEl.children[i]; if (el) el.outerHTML = wordHtml(i); }
    function appendWords(n) {
      const from = st.words.length;
      st.words.push(...makeWords(n, st.gen));
      wordsEl.insertAdjacentHTML('beforeend', st.words.slice(from).map((_, k) => wordHtml(from + k)).join(''));
    }

    // 커서: 다음에 칠 글자 앞(단어 끝이면 마지막 글자 뒤). 세 번째 줄로 넘어가면 한 줄 올린다.
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
      caret.style.left = `${x - 1}px`;
      caret.style.top = `${y - st.shift + (lineH - caret.offsetHeight) / 2}px`;
    }
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
      st = { words, typed: [], cur: '', judged: 0, base: 0, wi: 0, composing: false, gen, started: false, ended: false, start: 0, shift: 0, timer: null,
        keys: { correct: 0, incorrect: 0 }, secRaw: 0, secErr: 0, samples: [] };
      root.classList.remove('running');
      q('.mt-result').hidden = true;
      q('.mt-test').hidden = false;
      hid.value = '';
      renderAll();
      updateCounter();
      q('.mt-livewpm').textContent = '';
      focus();
      opts.onChange?.();
    }
    function startTest() {
      st.started = true;
      st.start = performance.now();
      root.classList.add('running'); // 시험 중엔 설정 줄을 숨긴다
      st.timer = setInterval(tick, 1000);
    }
    function tick() {
      const sec = (performance.now() - st.start) / 1000;
      st.samples.push({ raw: st.secRaw * 12, wpm: wpmSoFar(sec), err: st.secErr });
      st.secRaw = 0; st.secErr = 0;
      updateCounter(sec);
      q('.mt-livewpm').textContent = `${Math.round(wpmSoFar(sec))}`;
      if (cfg.mode === 'time' && sec >= cfg.time - 0.05) finish();
    }
    function updateCounter(sec = 0) {
      q('.mt-counter').textContent = cfg.mode === 'time'
        ? (st.started ? Math.max(0, Math.round(cfg.time - sec)) : cfg.time)
        : `${st.wi}/${st.words.length}`;
    }
    // 글자 통계 (몽키타입과 같은 기준)
    function charStats() {
      let correctWordChars = 0, correct = 0, incorrect = 0, extra = 0, missed = 0, rawChars = 0;
      for (let i = 0; i < st.wi; i++) {
        const t = st.typed[i], w = st.words[i];
        if (t === w) correctWordChars += w.length + 1;
        rawChars += t.length + 1;
        for (let j = 0; j < Math.max(w.length, t.length); j++) {
          if (j >= w.length) extra++; else if (j >= t.length) missed++; else if (t[j] === w[j]) correct++; else incorrect++;
        }
      }
      // 치고 있던 마지막 단어: 맞게 친 앞부분만 속도에 넣고, 덜 친 글자는 빠진 글자로 세지 않는다
      const w = st.words[st.wi] || '', t = st.cur;
      rawChars += t.length;
      let prefixOk = true;
      for (let j = 0; j < t.length; j++) {
        if (j >= w.length) { extra++; prefixOk = false; } else if (t[j] === w[j]) correct++; else { incorrect++; prefixOk = false; }
      }
      if (prefixOk) correctWordChars += t.length;
      return { correctWordChars, correct, incorrect, extra, missed, rawChars };
    }
    const wpmSoFar = (sec) => (sec <= 0 ? 0 : (charStats().correctWordChars / 5) / (sec / 60));

    function setCurrent(v, composing) {
      if (st.ended) return;
      if (!st.started && v.length) startTest();
      // 정확도: 글자가 확정될 때 한 번씩 센다 (조합 중인 마지막 글자는 아직 안 센다)
      const before = st.cur;
      const settled = composing ? Math.max(0, v.length - 1) : v.length;
      let common = 0;
      while (common < before.length && common < v.length && before[common] === v[common]) common++;
      st.judged = Math.min(st.judged, common, settled);
      const w = st.words[st.wi] || '';
      for (let j = st.judged; j < settled; j++) {
        if (j < w.length && v[j] === w[j]) st.keys.correct++; else { st.keys.incorrect++; st.secErr++; }
        st.secRaw++;
      }
      st.judged = settled;
      st.cur = v;
      st.composing = !!composing;
      renderWord(st.wi);
      updateCaret();
      markTyping();
      if (cfg.mode === 'words' && st.wi === st.words.length - 1 && v === st.words[st.wi]) commitWord();
    }
    // 입력칸 값이 기준: 공백 앞까지가 끝난 단어, 나머지가 지금 치는 단어.
    // 한글 조합 중에 입력칸을 비우면 IME가 글자를 다시 써 넣으므로, 비우지 않고 단어 시작 위치(base)만 옮긴다.
    function sync() {
      if (!st || st.ended) return;
      let rest = hid.value.slice(st.base);
      let sp;
      while ((sp = rest.indexOf(' ')) !== -1) {
        const word = rest.slice(0, sp);
        st.base += sp + 1;
        rest = rest.slice(sp + 1);
        if (!word.length) continue; // 단어 시작에서 공백은 무시
        setCurrent(word, false);
        if (st.ended) return;
        if (st.cur === word) commitWord(); // 마지막 단어가 맞으면 setCurrent 가 이미 넘겼다
        if (st.ended) return;
      }
      if (rest !== st.cur || st.composing !== imeComposing) setCurrent(rest, imeComposing);
      // 끝난 단어가 쌓이면 조합이 없을 때만 입력칸을 비운다
      if (!imeComposing && !rest && st.base > 200 && st.base === hid.value.length) { hid.value = ''; st.base = 0; }
    }
    function commitWord() {
      const ok = st.cur === st.words[st.wi];
      if (ok) st.keys.correct++; else { st.keys.incorrect++; st.secErr++; }
      st.secRaw++;
      st.typed[st.wi] = st.cur;
      st.cur = '';
      st.judged = 0;
      st.composing = false;
      st.wi++;
      renderWord(st.wi - 1);
      if (cfg.mode === 'words' && st.wi >= st.words.length) { finish(); return; }
      if (cfg.mode === 'time' && st.words.length - st.wi < TIME_BUFFER) appendWords(TIME_BUFFER);
      renderWord(st.wi);
      updateCounter((performance.now() - st.start) / 1000);
      updateCaret();
    }
    // 앞 단어로 돌아가기: 틀린 단어일 때만
    function backWord(clear) {
      if (st.wi === 0) return;
      const p = st.wi - 1;
      if (st.typed[p] === st.words[p]) return;
      st.wi = p;
      st.cur = clear ? '' : st.typed[p];
      st.judged = st.cur.length;
      st.typed.length = p;
      hid.value = st.cur;
      st.base = 0;
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
      const frac = sec - st.samples.length;
      if (frac > 0.3) st.samples.push({ raw: (st.secRaw / frac) * 12, wpm: 0, err: st.secErr });
      const c = charStats();
      const min = Math.max(sec, 0.001) / 60;
      const wpm = (c.correctWordChars / 5) / min, raw = (c.rawChars / 5) / min;
      const keys = st.keys.correct + st.keys.incorrect;
      const acc = keys ? (st.keys.correct / keys) * 100 : 0;
      if (st.samples.length) st.samples[st.samples.length - 1].wpm = wpm;
      const raws = st.samples.map((s) => s.raw);
      const mean = raws.reduce((a, b) => a + b, 0) / Math.max(1, raws.length);
      const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, raws.length));
      const cov = mean ? sd / mean : 1;
      const consistency = Math.max(0, 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5)));
      const result = {
        mode: cfg.mode, amount: cfg.mode === 'time' ? cfg.time : cfg.words, lang: cfg.lang, punctuation: cfg.punctuation, numbers: cfg.numbers,
        wpm: +wpm.toFixed(2), raw: +raw.toFixed(2), acc: +acc.toFixed(2), consistency: +consistency.toFixed(2),
        chars: { correct: c.correct, incorrect: c.incorrect, extra: c.extra, missed: c.missed }, dur: +sec.toFixed(2),
      };
      showResult(result);
      if (sec >= 5 && c.rawChars >= 10) {
        const r = await widget.typing.result(result);
        if (!destroyed) q('.mt-pb').hidden = !r?.isPb;
      }
      opts.onChange?.();
    }
    function showResult(r) {
      root.classList.remove('running');
      q('.mt-test').hidden = true;
      q('.mt-result').hidden = false;
      q('.mt-pb').hidden = true;
      const set = (k, v, title) => { const el = q(`[data-r="${k}"]`); el.textContent = v; if (title) el.title = title; };
      set('wpm', Math.round(r.wpm), `${r.wpm.toFixed(2)} wpm`);
      set('acc', `${Math.round(r.acc)}%`, `${r.acc.toFixed(2)}%`);
      set('type', `${r.mode} ${r.amount} ${r.lang === 'korean' ? '한국어' : 'english'}${r.punctuation ? ' @' : ''}${r.numbers ? ' #' : ''}`);
      set('raw', Math.round(r.raw));
      set('chars', `${r.chars.correct}/${r.chars.incorrect}/${r.chars.extra}/${r.chars.missed}`);
      set('cons', `${Math.round(r.consistency)}%`);
      set('time', `${Math.round(r.dur)}s`);
      drawChart();
      q('[data-act="next"]').focus();
    }
    // 초당 그래프: 강조색 선 = wpm(누적), 흐린 선 = raw(그 1초), 빨간 × = 틀린 글자
    function drawChart() {
      const cv = q('.mt-chart');
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      const s = st.samples;
      if (!s.length) return;
      const css = getComputedStyle(root);
      const col = (n) => css.getPropertyValue(n).trim();
      const pad = { l: compact ? 24 : 36, r: 6, t: 8, b: compact ? 16 : 22 };
      const maxV = Math.max(10, ...s.map((p) => Math.max(p.raw, p.wpm))) * 1.15;
      const X = (i) => pad.l + (s.length === 1 ? 0 : (i / (s.length - 1)) * (W - pad.l - pad.r));
      const Y = (v) => H - pad.b - (v / maxV) * (H - pad.t - pad.b);
      g.font = `${compact ? 9 : 11}px Consolas, monospace`;
      g.fillStyle = col('--mt-sub'); g.strokeStyle = col('--mt-sub-alt'); g.lineWidth = 1;
      for (let k = 0; k <= (compact ? 2 : 4); k++) {
        const v = (maxV / (compact ? 2 : 4)) * k, y = Y(v);
        g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke();
        g.fillText(String(Math.round(v)), 2, y + 3);
      }
      const step = Math.max(1, Math.ceil(s.length / (compact ? 6 : 10)));
      for (let i = 0; i < s.length; i += step) g.fillText(String(i + 1), X(i) - 3, H - 4);
      const line = (key, color, width) => { g.strokeStyle = color; g.lineWidth = width; g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[key])) : g.moveTo(X(i), Y(p[key])))); g.stroke(); };
      line('raw', col('--mt-sub'), compact ? 1.5 : 2);
      line('wpm', col('--mt-main'), compact ? 2.2 : 3);
      g.strokeStyle = col('--mt-error'); g.lineWidth = 2;
      s.forEach((p, i) => { if (!p.err) return; const x = X(i), y = Y(p.raw), d = compact ? 3 : 4; g.beginPath(); g.moveTo(x - d, y - d); g.lineTo(x + d, y + d); g.moveTo(x + d, y - d); g.lineTo(x - d, y + d); g.stroke(); });
    }

    // ───────────── 입력 ─────────────
    function focus() {
      hid.focus({ preventScroll: true });
      root.classList.toggle('unfocused', document.activeElement !== hid);
    }
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); };
    // 한글 IME: 이벤트 순서는 환경마다 달라서, 어떤 이벤트가 오든 입력칸 값을 다시 읽어 맞춘다(sync)
    let imeComposing = false;
    on(hid, 'compositionstart', () => { imeComposing = true; });
    on(hid, 'compositionend', () => { imeComposing = false; sync(); });
    on(hid, 'input', (e) => { if (e.isComposing) imeComposing = true; sync(); });
    on(hid, 'keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); newTest(false); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); opts.onClose?.(); return; }
      if (st.ended) return;
      const composing = imeComposing || e.isComposing || e.keyCode === 229;
      if (e.key === 'Backspace' && !composing) {
        if (e.ctrlKey) { e.preventDefault(); if (st.cur.length) { hid.value = ''; st.base = 0; setCurrent('', false); } else backWord(true); return; }
        if (!st.cur.length) { e.preventDefault(); backWord(false); }
      }
      if (e.key === 'Enter' || /^(Arrow|Home$|End$|Page)/.test(e.key)) e.preventDefault(); // 입력칸 안에서 커서가 움직이면 안 된다
    });
    on(hid, 'blur', () => root.classList.add('unfocused'));
    on(hid, 'focus', () => root.classList.remove('unfocused'));
    on(q('.mt-wrap'), 'mousedown', (e) => { e.preventDefault(); focus(); });
    // 결과 화면 등 엔진 안에 포커스가 있을 때의 키 (위젯의 다른 입력칸은 건드리지 않는다)
    on(root, 'keydown', (e) => {
      if (e.target === hid) return;
      if (e.key === 'Escape') { e.preventDefault(); opts.onClose?.(); }
      else if (e.key === 'Tab') { e.preventDefault(); newTest(false); }
    });
    on(q('.mt-restart'), 'click', () => newTest(false));
    on(q('[data-act="next"]'), 'click', () => newTest(false));
    on(q('[data-act="again"]'), 'click', () => newTest(true));
    const onResize = () => { if (destroyed) return; if (!q('.mt-result').hidden) drawChart(); else updateCaret(); };
    window.addEventListener('resize', onResize);

    // ───────────── 설정 줄 ─────────────
    function renderConfig() {
      qa('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === cfg.mode));
      qa('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === cfg.lang));
      qa('[data-toggle]').forEach((b) => b.classList.toggle('on', !!cfg[b.dataset.toggle]));
      const cur = cfg.mode === 'time' ? cfg.time : cfg.words;
      q('.mt-amounts').innerHTML = AMOUNTS[cfg.mode].map((n) => `<button data-amount="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`).join('');
    }
    async function setCfg(patch) {
      cfg = { ...cfg, ...patch };
      renderConfig();
      newTest(false);
      try { await widget.typing.settings(patch); } catch { /* 저장 실패해도 진행 */ }
    }
    on(q('.mt-config'), 'click', (e) => {
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
      if (destroyed) return;
      renderConfig();
      newTest(false);
    })();

    return {
      focus,
      restart: () => newTest(false),
      get state() { return st; },
      setCfg,
      destroy() {
        destroyed = true;
        if (st?.timer) clearInterval(st.timer);
        clearTimeout(idleTimer);
        window.removeEventListener('resize', onResize);
        root.innerHTML = '';
        root.classList.remove('mt', 'compact', 'running', 'unfocused');
      },
    };
  };
})();

// 처음 설정(온보딩): 0 환영 → 1 배치 → 2 카드 → 3 날씨 → 4 달력 → 5 AI → 6 업무 → 7 알림 → 8 요약
// 모든 값은 고르는 즉시 저장한다(중간에 꺼도 이어서). 키는 확인에 성공했을 때만 저장한다.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STEPS = ['welcome', 'place', 'cards', 'weather', 'calendar', 'ai', 'work', 'notify', 'done'];
const ACCENTS = ['#b79cff', '#8ab4ff', '#6fd4c4', '#ffb35c', '#ff9ec7'];
const CORNERS = { 'top-left': '왼쪽 위', 'top-right': '오른쪽 위', 'bottom-left': '왼쪽 아래', 'bottom-right': '오른쪽 아래' };
const MODES = { desktop: ['바탕화면에 고정', '다른 창 뒤에 머물고 위치가 잠겨요'], normal: ['일반 창', '다른 창처럼 앞뒤로 움직여요'], top: ['항상 위에 표시', '모든 창 위에 떠 있어요'] };
const SECTIONS = [['clock', '시계·날짜'], ['weather', '날씨'], ['calendar', '달력·일정'], ['todo', '할 일'], ['memo', '메모'], ['ai', 'AI 비서']];
const PRESET_LABEL = { pro: '전문 비서', friendly: '친근한 동료', concise: '짧고 간결하게', custom: '직접 쓰기' };

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
};

let step = Number(new URLSearchParams(location.search).get('step') || 0);
let config = null;
let st = null;            // { done, step, skipped, displays }
let skipped = new Set();  // "나중에" 누른 단계
const ui = {              // 화면에서만 쓰는 상태
  weatherSrc: null, keyResult: null, results: [], searching: false,
  calMode: null, gcal: null, icalErr: '',
  ai: null, presets: {}, loginBusy: '',
  hotkey: null,
};

const sw = (id, on, label) => `<button class="sw" role="switch" id="${id}" aria-checked="${on ? 'true' : 'false'}" aria-label="${esc(label)}"></button>`;
const okLine = (t) => `<div class="result ok">${ICON.check}<span>${esc(t)}</span></div>`;
const errLine = (t) => `<div class="result err"><span>${esc(t)}</span></div>`;

async function patch(p) {
  config = await widget.updateConfig(p);
}

function applyTheme() {
  document.documentElement.dataset.theme = config.appearance.theme;
  document.documentElement.style.setProperty('--accent', config.appearance.accent);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(config.appearance.accent.slice(i, i + 2), 16));
  if ([r, g, b].every(Number.isFinite)) document.documentElement.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
}

// ───────────── 단계별 화면 ─────────────

const VIEW = {
  welcome: () => `
    <div class="ob-sec welcome">
      <img class="hero" src="../assets/mungchi-cat.svg" alt="뭉치위젯">
      <h1>반가워요, 뭉치위젯이에요</h1>
      <p>바탕화면에 시계·날씨·달력·할 일을 띄워 두는 위젯이에요.<br>몇 가지만 정하면 바로 쓸 수 있어요. 2~3분이면 끝나요.</p>
    </div>
    <div class="ob-sec">
      <button class="opt on" id="w-new"><span class="ic">${ICON.plus}</span><span style="flex:1"><div class="t">새로 시작하기</div><div class="s">화면 배치부터 하나씩 정해요</div></span><span class="ok-ic">${ICON.check}</span></button>
      <button class="opt" id="w-restore"><span class="ic">${ICON.down}</span><span style="flex:1"><div class="t">백업에서 가져오기</div><div class="s">다른 PC에서 쓰던 설정·할 일·메모를 그대로 옮겨요</div></span></button>
      <div id="w-restore-msg"></div>
    </div>
    <div class="privacy">${ICON.lock}<span>설정과 키는 이 PC에만 암호화해서 저장해요. 날씨·캘린더·AI 요청은 각 서비스로만 보내고, 다른 곳으로는 보내지 않아요.</span></div>`,

  place: () => {
    const w = config.window;
    const ds = st.displays;
    const sel = ds.find((d) => d.id === w.displayId) || ds.find((d) => d.primary) || ds[0];
    // 모니터 실제 배치를 상자 안에 맞춰 그린다
    const minX = Math.min(...ds.map((d) => d.bounds.x)), minY = Math.min(...ds.map((d) => d.bounds.y));
    const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width)), maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height));
    const scale = Math.min(440 / (maxX - minX), 88 / (maxY - minY));
    const offX = (472 - (maxX - minX) * scale) / 2, offY = (112 - (maxY - minY) * scale) / 2;
    const mons = ds.map((d) => `<button class="mon ${d.id === sel.id ? 'on' : ''}" data-mon="${d.id}" style="left:${offX + (d.bounds.x - minX) * scale}px;top:${offY + (d.bounds.y - minY) * scale}px;width:${d.bounds.width * scale - 6}px;height:${d.bounds.height * scale - 6}px">
        <b>${d.index}${d.primary ? ' · 주 모니터' : ''}</b><span>${esc(d.size)}</span></button>`).join('');
    const corner = w.corner || 'top-right';
    return `
      <h1>위젯을 어디에 둘까요?</h1>
      <p class="ob-lead">고르는 대로 위젯이 바로 움직여요. 위젯을 직접 끌어서 옮겨도 돼요.</p>
      <div class="ob-sec"><span class="ob-label">모니터${ds.length > 1 ? '' : ' (1대)'}</span><div class="mons">${mons}</div></div>
      <div class="place-row">
        <div class="ob-sec"><span class="ob-label">위치</span>
          <div class="screen">${Object.entries(CORNERS).map(([k, v]) => `<button class="corner ${k.replace(/(\w)\w*-(\w)\w*/, '$1$2')} ${k === corner ? 'on' : ''}" data-corner="${k}" aria-label="${v}"></button>`).join('')}<span class="lbl">${CORNERS[corner]}</span></div>
        </div>
        <div class="ob-sec modes"><span class="ob-label">창 모드</span>
          ${Object.entries(MODES).map(([k, [t, s]]) => `<button class="opt ${w.mode === k ? 'on' : ''}" data-mode="${k}"><span style="flex:1"><div class="t">${t}</div>${w.mode === k ? `<div class="s">${s}</div>` : ''}</span></button>`).join('')}
        </div>
      </div>
      <div class="grid2" style="gap:16px">
        <label class="ob-sec"><span class="ob-label">크기 <b class="num" id="v-zoom">${Math.round(w.zoom * 100)}%</b></span><input type="range" id="r-zoom" min="0.8" max="1.5" step="0.05" value="${w.zoom}"></label>
        <label class="ob-sec"><span class="ob-label">배경 농도 <b class="num" id="v-glass">${Math.round(config.appearance.glass * 100)}%</b></span><input type="range" id="r-glass" min="0.3" max="0.95" step="0.05" value="${config.appearance.glass}"></label>
      </div>`;
  },

  cards: () => {
    const a = config.appearance;
    return `
      <h1>무엇을 보여 줄까요?</h1>
      <p class="ob-lead">끈 카드는 나중에 설정에서 다시 켤 수 있어요.</p>
      <div class="grid2">${SECTIONS.map(([k, t]) => `<label class="ck"><input type="checkbox" data-sec="${k}" ${config.sections[k] ? 'checked' : ''}>${t}</label>`).join('')}</div>
      <div class="ob-sec"><span class="ob-label">테마</span>
        <div class="grid2"><button class="opt ${a.theme === 'dark' ? 'on' : ''}" data-theme="dark" style="justify-content:center"><span class="t">다크</span></button><button class="opt ${a.theme === 'light' ? 'on' : ''}" data-theme="light" style="justify-content:center"><span class="t">라이트</span></button></div></div>
      <div class="ob-sec"><span class="ob-label">강조색</span>
        <div class="sws">${ACCENTS.map((c) => `<button class="sw-c ${a.accent === c ? 'on' : ''}" data-accent="${c}" style="background:${c}" aria-label="강조색 ${c}"></button>`).join('')}</div></div>
      <div class="ob-panel">
        <div class="ob-row"><span class="grow">24시간제로 보기</span>${sw('s-24h', a.clock24h, '24시간제')}</div>
        <div class="ob-row"><span class="grow">초 표시</span>${sw('s-sec', a.showSeconds, '초 표시')}</div>
      </div>`;
  },

  weather: () => {
    const locs = config.weather.locations;
    const src = ui.weatherSrc;
    return `
      <h1>어느 지역 날씨를 볼까요?</h1>
      <div class="ob-sec"><span class="ob-label">지역 (최대 3곳)</span>
        ${locs.length ? `<div class="ob-panel">${locs.map((l, i) => `<div class="ob-row"><span class="sub num" style="width:12px">${i + 1}</span><span class="grow"><b style="font-weight:600">${esc(l.name)}</b></span><button class="loc-x" data-del-loc="${i}" aria-label="${esc(l.name)} 빼기">✕</button></div>`).join('')}</div>` : '<div class="ob-note">아직 지역이 없어요. 아래에서 검색해 추가해 주세요.</div>'}
        ${locs.length < 3 ? `<div class="row2"><input class="in" id="loc-q" placeholder="지역 검색 — 예: 성남시 분당구"><button class="b" id="loc-go">검색</button></div>` : ''}
        ${ui.searching ? '<div class="result wait">찾는 중…</div>' : ''}
        ${ui.results.length ? `<div class="results">${ui.results.map((r, i) => `<button data-add-loc="${i}">${esc(r.name)}<span>${esc(r.region)}</span></button>`).join('')}</div>` : ''}
      </div>
      <div class="ob-sec"><span class="ob-label">날씨 자료</span>
        <button class="opt ${src === 'basic' ? 'on' : ''}" data-src="basic"><span class="dot"></span><span><div class="t">기본 날씨 · 키 필요 없음</div><div class="s">바로 쓸 수 있어요 (Open-Meteo 예보)</div></span></button>
        <button class="opt ${src === 'kma' ? 'on' : ''}" data-src="kma"><span class="dot"></span><span><div class="t">기상청 · 더 정확해요</div><div class="s">공공데이터포털 인증키가 필요해요 (무료)</div></span></button>
        ${src === 'kma' ? `<div class="opt-body">
          ${config.weather.hasKey ? okLine('기상청 인증키가 저장돼 있어요. 바꾸려면 새 키를 넣고 확인을 눌러요.') : `<ol class="ob-note" style="margin:0;padding-left:18px;font-size:11.5px;line-height:18px;color:var(--ink-2)">
            <li><a href="#" data-link="https://www.data.go.kr">공공데이터포털</a>에 로그인</li>
            <li>“기상청_단기예보 조회서비스” 활용 신청 (보통 바로 승인)</li>
            <li>마이페이지의 일반 인증키(Decoding)를 붙여 넣기</li></ol>`}
          <div class="row2"><input class="in" type="password" id="kma-key" placeholder="일반 인증키 붙여 넣기" autocomplete="off"><button class="b pri" id="kma-test" style="padding:0 14px">연결 확인</button></div>
          <div id="kma-res">${ui.keyResult || ''}</div>
          <div class="ob-note">같은 키로 에어코리아(미세먼지 실측)와 기상특보도 신청하면 함께 보여요.</div>
        </div>` : ''}
      </div>`;
  },

  calendar: () => {
    const g = ui.gcal || {};
    const mode = ui.calMode;
    const icals = config.calendar.icalUrls;
    return `
      <h1>일정을 어디서 가져올까요?</h1>
      <p class="ob-lead">연결하지 않아도 할 일과 공휴일은 달력에 보여요.</p>
      <div class="ob-sec">
        <button class="opt ${mode === 'google' ? 'on' : ''}" data-cal="google"><span class="dot"></span><span><div class="t">구글 캘린더 연결 · 추천</div><div class="s">보기, 위젯에서 추가·수정·삭제, AI 비서의 일정 등록까지</div></span></button>
        ${mode === 'google' ? `<div class="opt-body">${g.connected ? okLine(`${g.email || '구글 계정'} 연결됐어요`)
          : g.connecting ? '<div class="result wait">브라우저에서 구글 로그인을 마쳐 주세요…</div>'
          : g.hasClient ? `<button class="b light" id="g-connect">${ICON.cal.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px;margin-right:6px"')}구글 계정으로 연결</button><span class="ob-note">브라우저가 열리면 로그인하고 권한을 허용해 주세요.</span>`
          : `<span class="ob-note">구글 연결에는 Google Cloud에서 받은 OAuth 클라이언트(데스크톱 앱) JSON이 한 번 필요해요.</span><button class="b" id="g-import">OAuth 클라이언트 JSON 가져오기</button>`}
          ${g.error ? errLine(g.error) : ''}</div>` : ''}
        <button class="opt ${mode === 'ical' ? 'on' : ''}" data-cal="ical"><span class="dot"></span><span><div class="t">iCal 주소 · 보기만</div><div class="s">구글·아웃룩·네이버 캘린더의 비공개 주소를 붙여 넣어요</div></span></button>
        ${mode === 'ical' ? `<div class="opt-body">
          ${icals.map((u, i) => `<div class="ob-row" style="min-height:32px"><span class="grow" style="font-size:11.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u)}</span><button class="loc-x" data-del-ical="${i}" aria-label="주소 빼기">✕</button></div>`).join('')}
          <div class="row2"><input class="in" id="ical-in" placeholder="https://… .ics"><button class="b" id="ical-add">추가</button></div>
          ${ui.icalErr ? errLine(ui.icalErr) : ''}</div>` : ''}
        <button class="opt ${mode === 'none' ? 'on' : ''}" data-cal="none"><span class="dot"></span><span class="t">연결 안 함</span></button>
      </div>
      <div class="ob-panel"><div class="ob-row"><span class="grow">한국 공휴일 표시</span>${sw('s-hol', config.calendar.koreanHolidays, '한국 공휴일')}</div></div>`;
  },

  ai: () => {
    const s = ui.ai || {};
    const row = (k, name, loginLabel) => {
      const v = s[k] || {};
      return `<div class="ob-row" style="min-height:44px"><span class="st-dot ${v.loggedIn ? 'ok' : ''}"></span><span class="grow"><b style="font-weight:600">${name}</b><span class="sub">${v.loggedIn ? `로그인됨${v.account ? ` · ${esc(v.account)}` : ''}` : esc(v.account || (v.installed === false ? '설치되지 않았어요' : '로그인 전'))}</span></span>
        ${v.loggedIn ? '<span class="tag ok">사용 가능</span>' : `<button class="b sm" data-login="${k}" ${ui.loginBusy ? 'disabled' : ''}>${ui.loginBusy === k ? '로그인 중…' : loginLabel}</button>`}</div>`;
    };
    const a = config.ai;
    return `
      <h1>AI 비서를 쓸까요?</h1>
      <p class="ob-lead">API 키 없이, 이미 쓰는 Claude나 ChatGPT 계정 로그인으로 동작해요.</p>
      <div class="ob-panel">${row('claude', 'Claude Code', 'Claude로 로그인')}${row('codex', 'ChatGPT (Codex)', 'ChatGPT로 로그인')}</div>
      <div class="place-row" style="align-items:flex-end">
        <div class="ob-sec"><span class="ob-label">프로필</span><div class="avs"><span class="av"><img src="../assets/mungchi-cat.svg" alt="고양이 프로필"></span></div></div>
        <label class="ob-sec" style="flex:1"><span class="ob-label">이름</span><input class="in" id="ai-name" value="${esc(a.name)}" maxlength="12" style="height:44px"></label>
      </div>
      <div class="ob-sec"><span class="ob-label">성격</span>
        <div class="chips-b">${['pro', 'friendly', 'concise', 'custom'].map((k) => `<button class="chip-b ${(a.personaPreset || 'pro') === k ? 'on' : ''}" data-preset="${k}">${PRESET_LABEL[k]}</button>`).join('')}</div>
        ${a.personaPreset === 'custom' ? `<textarea class="in" id="ai-persona" placeholder="예: 일정과 마감을 먼저 챙기고, 결론부터 짧게 말해 주세요.">${esc(a.persona)}</textarea>` : ''}
      </div>
      <div class="ob-panel">
        <div class="ob-row"><span class="grow">고양이 말투 (~냥)</span>${sw('s-cat', a.catTone, '고양이 말투')}</div>
        <div class="ob-row"><span class="grow">최근 메모를 AI와 공유<span class="sub">비밀번호·키처럼 보이는 부분은 항상 가려요</span></span>${sw('s-memo', a.shareMemos, '메모 공유')}</div>
      </div>`;
  },

  work: () => {
    const w = { enabled: false, lunchStart: '12:00', lunchMin: 60, ...(config.work || {}) };
    return `
      <h1>회사에서 flex를 쓰나요?</h1>
      <p class="ob-lead">시계 아래에 오늘 근무 시간과 퇴근 예정 시각을 보여 줘요. 쓰지 않으면 건너뛰세요.</p>
      <div class="ob-sec" style="padding:14px;border-radius:var(--radius-lg);background:#242834">
        <div class="ob-row" style="min-height:28px"><span class="grow"><b style="font-weight:600">flex 근무 시간 보여 주기</b></span>${sw('s-flex', w.enabled, 'flex 근무 시간')}</div>
        ${w.enabled ? `<button class="b" id="flex-login" style="background:rgb(var(--surface-rgb))">${w.state === 'ok' ? 'flex 다시 로그인' : 'flex 로그인'}</button>
          ${w.state === 'ok' ? okLine('flex에서 근무 시간을 읽었어요') : '<span class="ob-note">로그인은 한 번만 해요. 하루 한 번 flex 화면에서 근무 시간을 읽어 와요.</span>'}` : ''}
      </div>
      ${w.enabled ? `<div class="ob-sec"><span class="ob-label">점심시간 (근무 시간에서 빼요)</span>
        <div class="row2" style="justify-content:flex-start"><input class="in" type="time" id="lunch-s" value="${esc(w.lunchStart)}" style="flex:none">
          <select class="in" id="lunch-m" style="flex:none">${[[0, '없음'], [30, '30분'], [60, '1시간'], [90, '1시간 30분']].map(([v, t]) => `<option value="${v}" ${Number(w.lunchMin) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>` : ''}`;
  },

  notify: () => {
    const n = { events: true, eventMinutes: 10, todos: true, todoTime: '09:00', ...(config.notify || {}) };
    const b = { enabled: true, time: '08:30', ...(config.brief || {}) };
    const hk = ui.hotkey || {};
    const keys = (k) => (k ? k.split('+').map((x) => `<kbd>${esc(x.replace('Control', 'Ctrl'))}</kbd>`).join(' ') : '<span class="sub">꺼짐</span>');
    return `
      <h1>알림과 시작 설정</h1>
      <div class="ob-sec"><span class="ob-label">알림</span>
        <div class="ob-panel">
          <div class="ob-row"><span class="grow">일정 알림</span><select class="in sm" id="n-min" ${n.events ? '' : 'disabled'}>${[5, 10, 15, 30].map((m) => `<option value="${m}" ${n.eventMinutes === m ? 'selected' : ''}>${m}분 전</option>`).join('')}</select>${sw('s-nev', n.events, '일정 알림')}</div>
          <div class="ob-row"><span class="grow">오늘 마감 할 일</span><input class="in sm" type="time" id="n-todo" value="${esc(n.todoTime)}" ${n.todos ? '' : 'disabled'}>${sw('s-ntodo', n.todos, '할 일 알림')}</div>
          <div class="ob-row"><span class="grow">아침 브리핑<span class="sub">AI 비서가 오늘 날씨·일정·할 일을 요약해요</span></span><input class="in sm" type="time" id="n-brief" value="${esc(b.time)}" ${b.enabled ? '' : 'disabled'}>${sw('s-brief', b.enabled, '아침 브리핑')}</div>
        </div>
        <button class="b sm" id="n-test" style="align-self:flex-start">알림 테스트 보내기</button>
      </div>
      <div class="ob-sec"><span class="ob-label">빠른 입력 단축키</span>
        <div class="ob-panel"><div class="ob-row" style="min-height:44px"><span>${keys(hk.hotkey)}</span><span class="grow sub">어디서든 눌러 일정·할 일·메모를 바로 입력</span>
          <select class="in sm" id="hk">${(hk.options || []).map((o) => `<option value="${esc(o)}" ${o === hk.hotkey ? 'selected' : ''}>${esc(o.replace('Control', 'Ctrl'))}</option>`).join('')}<option value="" ${hk.hotkey ? '' : 'selected'}>끄기</option></select></div>
        ${hk.error ? errLine(hk.error) : ''}</div>
      </div>
      <div class="ob-panel">
        <div class="ob-row"><span class="grow">Windows 시작 시 자동 실행</span>${sw('s-auto', config.autoStart, '자동 실행')}</div>
        <div class="ob-row"><span class="grow">자동 백업<span class="sub">${config.backup?.extraDir ? `추가 위치: ${esc(config.backup.extraDir)}` : '하루 한 번 · OneDrive 같은 폴더에도 저장할 수 있어요'}</span></span><button class="b sm" id="bk-dir">${config.backup?.extraDir ? '바꾸기' : '폴더 추가'}</button></div>
      </div>`;
  },

  done: () => {
    const rows = summary();
    return `
      <h1>${rows.some((r) => !r.ok) ? '거의 다 됐어요' : '준비가 끝났어요'}</h1>
      <p class="ob-lead">건너뛴 항목은 위젯의 ⋯ 메뉴 → 처음 설정에서 언제든 이어서 할 수 있어요.</p>
      <div class="ob-panel">${rows.map((r) => `<div class="ob-row" style="min-height:44px">
        ${r.ok ? `<span class="ok-ic">${ICON.check}</span>` : '<span class="later-ic"></span>'}
        <span class="grow" style="font-weight:500">${r.title}</span>
        ${r.ok ? `<span class="val">${esc(r.value)}</span>` : `<span class="tag later">나중에</span><button class="b sm" data-goto="${r.step}">지금 하기</button>`}</div>`).join('')}</div>
      <div class="privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>
        <span>위젯 오른쪽 위 ⋯ 메뉴에서 창 모드와 설정을 바꿀 수 있어요.${ui.hotkey?.hotkey ? ` ${esc(ui.hotkey.hotkey.replace('Control', 'Ctrl').replace(/\+/g, ' + '))}로 어디서든 빠르게 입력해 보세요.` : ''}</span></div>`;
  },
};

// 요약: 단계마다 설정이 끝났는지와 한 줄 값
function summary() {
  const w = config.window;
  const g = ui.gcal || {};
  const ai = ui.ai || {};
  const aiOn = ai.claude?.loggedIn || ai.codex?.loggedIn;
  const disp = st.displays.find((d) => d.id === w.displayId) || st.displays.find((d) => d.primary);
  const calOk = g.connected || config.calendar.icalUrls.length > 0;
  const rows = [
    { step: 1, title: '화면 배치', ok: true, value: `모니터 ${disp?.index ?? 1} · ${CORNERS[w.corner || 'top-right']} · ${MODES[w.mode][0]}` },
    { step: 2, title: '카드와 모양', ok: true, value: `카드 ${Object.values(config.sections).filter(Boolean).length}개 · ${config.appearance.theme === 'light' ? '라이트' : '다크'}` },
    { step: 3, title: '날씨', ok: config.weather.locations.length > 0, value: `${config.weather.source !== 'basic' && config.weather.hasKey ? '기상청' : '기본 날씨'} · ${config.weather.locations.map((l) => l.name).join(', ')}` },
    { step: 4, title: '달력', ok: calOk || (!skipped.has('calendar') && ui.calMode === 'none'), value: g.connected ? '구글 캘린더 연결됨' : calOk ? `iCal ${config.calendar.icalUrls.length}개` : '연결 안 함' },
    { step: 5, title: 'AI 비서', ok: aiOn || (!skipped.has('ai') && !config.sections.ai), value: aiOn ? `${ai.claude?.loggedIn ? 'Claude' : 'ChatGPT'} · ${config.ai.name}` : '사용 안 함' },
    { step: 6, title: '업무 연동', ok: !skipped.has('work') || config.work?.state === 'ok', value: config.work?.enabled ? 'flex 근무 시간' : '사용 안 함' },
    { step: 7, title: '알림과 시작', ok: true, value: `${config.notify?.events !== false ? `일정 ${config.notify?.eventMinutes ?? 10}분 전` : '일정 알림 끔'}${config.autoStart ? ' · 자동 실행' : ''}` },
  ];
  return rows;
}

// ───────────── 단계에 들어갈 때 ─────────────

const ENTER = {
  async place() {
    await widget.onb.showWidget();
    const w = config.window;
    const d = st.displays.find((x) => x.id === w.displayId) || st.displays.find((x) => x.primary) || st.displays[0];
    if (!w.corner && !st.done) await widget.onb.place(d.id, 'top-right');
    config = await widget.getConfig();
  },
  async weather() {
    if (!ui.weatherSrc) ui.weatherSrc = config.weather.hasKey && config.weather.source !== 'basic' ? 'kma' : 'basic';
  },
  async calendar() {
    ui.gcal = await widget.gcal.status();
    if (!ui.calMode) ui.calMode = ui.gcal.connected ? 'google' : config.calendar.icalUrls.length ? 'ical' : 'google';
  },
  async ai() {
    ui.ai = await widget.aiStatus();
  },
  async notify() {
    ui.hotkey = await widget.quick.status();
    // 처음 설정에서는 자동 실행을 기본으로 켠다 (끄면 그대로 둔다)
    if (!st.autostartAsked) { st.autostartAsked = true; widget.onb.save({ autostartAsked: true }); if (!config.autoStart) await patch({ autoStart: true }); }
  },
  async done() {
    ui.gcal = ui.gcal || await widget.gcal.status();
    ui.ai = ui.ai || await widget.aiStatus();
  },
};

// ───────────── 그리기 ─────────────

function render() {
  const name = STEPS[step];
  $('#ob-count').textContent = step ? `${step} / 8` : '';
  const prog = $('#ob-prog');
  prog.hidden = step === 0;
  prog.innerHTML = Array.from({ length: 8 }, (_, i) => `<span class="${i < step ? 'on' : ''}"></span>`).join('');
  $('#ob-body').innerHTML = VIEW[name]();
  const later = { weather: '나중에 할게요', calendar: '나중에 할게요', ai: '쓰지 않을게요', work: '쓰지 않아요' }[name];
  $('#ob-foot').innerHTML = step === 0
    ? '<span class="grow">언제든 ⋯ 메뉴 → 처음 설정에서 다시 할 수 있어요</span><button class="b pri" id="f-next">시작하기</button>'
    : `<button class="b" id="f-prev">이전</button><span class="grow"></span>${later ? `<button class="b text" id="f-later">${later}</button>` : ''}<button class="b pri" id="f-next">${step === 8 ? '위젯 시작하기' : '다음'}</button>`;
  bind(name);
}

async function go(n) {
  step = Math.max(0, Math.min(8, n));
  await widget.onb.save({ step, skipped: [...skipped] });
  await ENTER[STEPS[step]]?.();
  render();
  $('#ob-body').scrollTop = 0;
}

async function finish() {
  const left = summary().filter((r) => !r.ok).map((r) => STEPS[r.step]);
  await widget.onb.finish(left);
}

// 스위치: 누르면 켜고 끄고, 바뀐 값을 넘긴다
function onSwitch(id, fn) {
  const el = $(`#${id}`);
  el?.addEventListener('click', async () => {
    const on = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    await fn(on);
  });
}

function bind(name) {
  $('#f-prev')?.addEventListener('click', () => go(step - 1));
  $('#f-next')?.addEventListener('click', async () => {
    skipped.delete(name);
    if (step === 8) return finish();
    go(step + 1);
  });
  $('#f-later')?.addEventListener('click', async () => {
    skipped.add(name);
    if (name === 'ai') await patch({ sections: { ai: false } });
    if (name === 'work' && config.work?.enabled) { await widget.flex.setEnabled(false); config = await widget.getConfig(); }
    go(step + 1);
  });
  $$('[data-link]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); widget.openExternal(a.dataset.link); }));
  BIND[name]?.();
}

const BIND = {
  welcome() {
    $('#w-new').addEventListener('click', () => go(1));
    $('#w-restore').addEventListener('click', async () => {
      const r = await widget.backup.restore();
      if (r?.canceled) return;
      if (r?.ok) { await widget.onb.finish([]); return; }
      $('#w-restore-msg').innerHTML = errLine(r?.error || '백업을 가져오지 못했어요.');
    });
  },
  place() {
    $$('[data-mon]').forEach((b) => b.addEventListener('click', async () => {
      await widget.onb.place(Number(b.dataset.mon), config.window.corner || 'top-right');
      config = await widget.getConfig(); render();
    }));
    $$('[data-corner]').forEach((b) => b.addEventListener('click', async () => {
      const d = config.window.displayId || st.displays.find((x) => x.primary)?.id;
      await widget.onb.place(d, b.dataset.corner);
      config = await widget.getConfig(); render();
    }));
    $$('[data-mode]').forEach((b) => b.addEventListener('click', async () => { await patch({ window: { mode: b.dataset.mode } }); render(); }));
    $('#r-zoom').addEventListener('input', (e) => { $('#v-zoom').textContent = `${Math.round(e.target.value * 100)}%`; });
    $('#r-zoom').addEventListener('change', async (e) => {
      await patch({ window: { zoom: Number(e.target.value) } });
      // 크기가 바뀌면 같은 모서리에 다시 맞춘다
      await widget.onb.place(config.window.displayId, config.window.corner || 'top-right');
      config = await widget.getConfig();
    });
    $('#r-glass').addEventListener('input', (e) => { $('#v-glass').textContent = `${Math.round(e.target.value * 100)}%`; });
    $('#r-glass').addEventListener('change', (e) => patch({ appearance: { glass: Number(e.target.value) } }));
  },
  cards() {
    $$('[data-sec]').forEach((c) => c.addEventListener('change', () => patch({ sections: { [c.dataset.sec]: c.checked } })));
    $$('[data-theme]').forEach((b) => b.addEventListener('click', async () => { await patch({ appearance: { theme: b.dataset.theme } }); applyTheme(); render(); }));
    $$('[data-accent]').forEach((b) => b.addEventListener('click', async () => { await patch({ appearance: { accent: b.dataset.accent } }); applyTheme(); render(); }));
    onSwitch('s-24h', (on) => patch({ appearance: { clock24h: on } }));
    onSwitch('s-sec', (on) => patch({ appearance: { showSeconds: on } }));
  },
  weather() {
    const search = async () => {
      const q = $('#loc-q')?.value.trim();
      if (!q) return;
      ui.searching = true; ui.results = []; render();
      try { ui.results = await widget.searchPlace(q); } catch { ui.results = []; }
      ui.searching = false;
      if (!ui.results.length) ui.keyResult = ui.keyResult; // 그대로
      render();
      if (!ui.results.length) $('#loc-q')?.insertAdjacentHTML('afterend', '');
    };
    $('#loc-go')?.addEventListener('click', search);
    $('#loc-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    $$('[data-add-loc]').forEach((b) => b.addEventListener('click', async () => {
      const r = ui.results[Number(b.dataset.addLoc)];
      const locations = [...config.weather.locations, { name: r.name, latitude: r.latitude, longitude: r.longitude }].slice(0, 3);
      ui.results = [];
      await patch({ weather: { locations } }); render();
    }));
    $$('[data-del-loc]').forEach((b) => b.addEventListener('click', async () => {
      const locations = config.weather.locations.filter((_, i) => i !== Number(b.dataset.delLoc));
      await patch({ weather: { locations } }); render();
    }));
    $$('[data-src]').forEach((b) => b.addEventListener('click', async () => {
      ui.weatherSrc = b.dataset.src;
      // 기본 날씨를 골라도 저장된 키는 지우지 않는다
      await patch({ weather: { source: b.dataset.src === 'basic' ? 'basic' : 'kma' } });
      render();
    }));
    $('#kma-test')?.addEventListener('click', async () => {
      const key = $('#kma-key').value.trim();
      $('#kma-res').innerHTML = '<div class="result wait">기상청에서 날씨를 받아 보는 중…</div>';
      const r = await widget.onb.weatherTest(key);
      ui.keyResult = r.ok ? okLine(`연결됐어요 · ${r.name} ${Math.round(r.temp)}° ${r.desc} · 키는 이 PC에 암호화해서 보관해요`) : errLine(r.error);
      if (r.ok) { config = await widget.getConfig(); await patch({ weather: { source: 'kma' } }); }
      render();
    });
  },
  calendar() {
    $$('[data-cal]').forEach((b) => b.addEventListener('click', () => { ui.calMode = b.dataset.cal; render(); }));
    $('#g-import')?.addEventListener('click', async () => {
      const r = await widget.gcal.importClient();
      ui.gcal = { ...(await widget.gcal.status()), error: r && !r.ok && !r.canceled ? r.error : '' };
      render();
    });
    $('#g-connect')?.addEventListener('click', async () => {
      ui.gcal = { ...ui.gcal, connecting: true }; render();
      const r = await widget.gcal.connect();
      ui.gcal = { ...(await widget.gcal.status()), error: r && !r.ok ? r.error : '' };
      render();
    });
    $('#ical-add')?.addEventListener('click', async () => {
      const u = $('#ical-in').value.trim();
      if (!/^(https?|webcal):\/\//i.test(u)) { ui.icalErr = 'https:// 로 시작하는 iCal 주소를 넣어 주세요.'; return render(); }
      ui.icalErr = '';
      await patch({ calendar: { icalUrls: [...config.calendar.icalUrls, u.replace(/^webcal:/i, 'https:')] } }); render();
    });
    $$('[data-del-ical]').forEach((b) => b.addEventListener('click', async () => {
      await patch({ calendar: { icalUrls: config.calendar.icalUrls.filter((_, i) => i !== Number(b.dataset.delIcal)) } }); render();
    }));
    onSwitch('s-hol', (on) => patch({ calendar: { koreanHolidays: on } }));
  },
  ai() {
    $$('[data-login]').forEach((b) => b.addEventListener('click', async () => {
      ui.loginBusy = b.dataset.login; render();
      try { await widget.aiLogin(b.dataset.login); } catch { /* 상태로 확인 */ }
      ui.ai = await widget.aiStatus();
      ui.loginBusy = '';
      // 로그인되면 AI 카드를 켜고 그 계정을 쓴다
      const p = b.dataset.login;
      if (ui.ai[p]?.loggedIn) await patch({ sections: { ai: true }, ai: { provider: p } });
      render();
    }));
    $('#ai-name').addEventListener('change', (e) => patch({ ai: { name: e.target.value.trim() || '뭉치' } }));
    $$('[data-preset]').forEach((b) => b.addEventListener('click', async () => { await patch({ ai: { personaPreset: b.dataset.preset } }); render(); }));
    $('#ai-persona')?.addEventListener('change', (e) => patch({ ai: { persona: e.target.value } }));
    onSwitch('s-cat', (on) => patch({ ai: { catTone: on } }));
    onSwitch('s-memo', (on) => patch({ ai: { shareMemos: on } }));
  },
  work() {
    onSwitch('s-flex', async (on) => { await widget.flex.setEnabled(on); config = await widget.getConfig(); render(); });
    $('#flex-login')?.addEventListener('click', async () => { await widget.flex.login(); config = await widget.getConfig(); render(); });
    const lunch = () => patch({ work: { lunchStart: $('#lunch-s').value || '12:00', lunchMin: Number($('#lunch-m').value) } });
    $('#lunch-s')?.addEventListener('change', lunch);
    $('#lunch-m')?.addEventListener('change', lunch);
  },
  notify() {
    onSwitch('s-nev', async (on) => { await patch({ notify: { events: on } }); render(); });
    onSwitch('s-ntodo', async (on) => { await patch({ notify: { todos: on } }); render(); });
    onSwitch('s-brief', async (on) => { await patch({ brief: { enabled: on } }); render(); });
    $('#n-min').addEventListener('change', (e) => patch({ notify: { eventMinutes: Number(e.target.value) } }));
    $('#n-todo').addEventListener('change', (e) => e.target.value && patch({ notify: { todoTime: e.target.value } }));
    $('#n-brief').addEventListener('change', (e) => e.target.value && patch({ brief: { time: e.target.value } }));
    $('#n-test').addEventListener('click', () => {
      try { new Notification(`${config.ai.name || '뭉치'}의 알림 테스트`, { body: '알림이 이렇게 보여요. 눌러 보면 위젯이 앞으로 나와요.' }); } catch { /* 알림 불가 */ }
    });
    $('#hk').addEventListener('change', async (e) => { await widget.quick.setHotkey(e.target.value); ui.hotkey = await widget.quick.status(); render(); });
    onSwitch('s-auto', (on) => patch({ autoStart: on }));
    $('#bk-dir').addEventListener('click', async () => { await widget.backup.chooseExtra(); config = await widget.getConfig(); render(); });
  },
  done() {
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.goto))));
  },
};

$('#ob-close').addEventListener('click', () => widget.closeSelf());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') widget.closeSelf(); });

(async () => {
  config = await widget.getConfig();
  st = await widget.onb.state();
  skipped = new Set(st.skipped || []);
  applyTheme();
  await go(step);
})();

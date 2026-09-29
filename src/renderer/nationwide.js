const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

let places = [];
let selected = '서울';
let metric = 'now';

// ── 지도 투영 (경위도 → 지도 상자 안의 px) ──
const BOUNDS = { lon0: 125.55, lon1: 131.3, lat0: 32.95, lat1: 38.75 };
const ASPECT = ((BOUNDS.lon1 - BOUNDS.lon0) * Math.cos((36 * Math.PI) / 180)) / (BOUNDS.lat1 - BOUNDS.lat0);

// 대략적인 남한 해안선 (장식용)
const MAINLAND = [
  [126.12, 37.72], [126.55, 37.77], [126.68, 37.95], [127.1, 38.28], [127.6, 38.33], [128.1, 38.33], [128.36, 38.62],
  [128.62, 38.18], [128.95, 37.72], [129.2, 37.35], [129.42, 36.95], [129.43, 36.45], [129.47, 36.1], [129.58, 36.05],
  [129.45, 35.6], [129.3, 35.3], [129.08, 35.08], [128.75, 35.0], [128.45, 34.85], [128.05, 34.9], [127.75, 34.7],
  [127.45, 34.62], [127.2, 34.45], [126.85, 34.35], [126.5, 34.3], [126.3, 34.45], [126.2, 34.7], [126.4, 35.0],
  [126.35, 35.35], [126.55, 35.7], [126.6, 36.0], [126.45, 36.35], [126.15, 36.62], [126.3, 36.95], [126.75, 37.02],
  [126.8, 37.2], [126.62, 37.4], [126.62, 37.6],
];

function project(lon, lat, box) {
  return {
    x: ((lon - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0)) * box.w + box.x,
    y: ((BOUNDS.lat1 - lat) / (BOUNDS.lat1 - BOUNDS.lat0)) * box.h + box.y,
  };
}

function mapBox() {
  const m = $('#map');
  const W = m.clientWidth, H = m.clientHeight;
  let h = H - 20, w = h * ASPECT;
  if (w > W - 20) { w = W - 20; h = w / ASPECT; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, W, H };
}

// ── 값 표시 ──
const fmt = (v) => (Number.isFinite(v) ? `${Math.round(v)}°` : '-');
function tempClass(t) {
  if (!Number.isFinite(t)) return '';
  if (t >= 28) return 'hot';
  if (t >= 20) return 'warm';
  if (t >= 12) return 'mild';
  if (t >= 4) return 'cool';
  return 'cold';
}

function chipValue(p) {
  if (!p.ok) return { icon: 'cloudy', text: '!', cls: '' };
  const d = p.data, today = d.daily[0] || {}, tmr = d.daily[1] || {};
  switch (metric) {
    case 'max': return { icon: today.icon, text: fmt(today.max), cls: tempClass(today.max) };
    case 'min': return { icon: today.icon, text: fmt(today.min), cls: tempClass(today.min) };
    case 'pop': return { icon: today.icon, text: `${today.pop ?? 0}%`, cls: today.pop >= 50 ? 'wet' : '' };
    case 'tomorrow': return { icon: tmr.icon, text: `${fmt(tmr.max)}<span class="muted" style="font-weight:400;font-size:11px"> / ${fmt(tmr.min)}</span>`, cls: tempClass(tmr.max) };
    default: return { icon: d.current.icon, text: fmt(d.current.temp), cls: tempClass(d.current.temp) };
  }
}

// ── 지도 그리기 ──
function renderMap() {
  const map = $('#map');
  const box = mapBox();
  const path = (pts) => pts.map(([lo, la], i) => {
    const p = project(lo, la, box);
    return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(' ') + 'Z';
  const jeju = project(126.55, 33.38, box);
  const ulleung = project(130.87, 37.5, box);
  const rx = (0.42 / (BOUNDS.lon1 - BOUNDS.lon0)) * box.w;
  const ry = (0.16 / (BOUNDS.lat1 - BOUNDS.lat0)) * box.h;

  // 칩 먼저 배치 (크기를 재야 겹침을 풀 수 있다)
  const chips = places.map((p) => {
    const v = chipValue(p);
    const a = project(p.longitude, p.latitude, box);
    return { p, v, ax: a.x, ay: a.y, x: a.x, y: a.y };
  });
  map.innerHTML = `<svg class="land" viewBox="0 0 ${box.W} ${box.H}">
      <path d="${path(MAINLAND)}" fill="var(--field)" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="${jeju.x}" cy="${jeju.y}" rx="${rx}" ry="${ry}" fill="var(--field)" stroke="var(--line)" stroke-width="1.5"/>
      <circle cx="${ulleung.x}" cy="${ulleung.y}" r="4" fill="var(--field)" stroke="var(--line)" stroke-width="1.5"/>
      <g id="leaders"></g>
    </svg>` + chips.map((c, i) => `
    <button class="chip ${c.p.ok ? '' : 'err'} ${c.p.name === selected ? 'on' : ''}" data-i="${i}" title="${esc(c.p.ok ? c.p.data.current.desc : c.p.error)}">
      ${weatherIcon(c.v.icon, 22)}<span class="nm">${esc(c.p.name)}</span><span class="v ${c.v.cls}">${c.v.text}</span>
    </button>`).join('');

  const els = $$('.chip', map);
  chips.forEach((c, i) => { c.w = els[i].offsetWidth + 6; c.h = els[i].offsetHeight + 6; });
  relax(chips, box);

  let leaders = '';
  chips.forEach((c, i) => {
    els[i].style.left = `${c.x}px`;
    els[i].style.top = `${c.y}px`;
    const moved = Math.hypot(c.x - c.ax, c.y - c.ay) > 14;
    leaders += `<circle cx="${c.ax}" cy="${c.ay}" r="2.6" fill="var(--accent)" opacity="0.8"/>`;
    if (moved) leaders += `<line x1="${c.ax}" y1="${c.ay}" x2="${c.x}" y2="${c.y}" stroke="var(--accent)" stroke-opacity="0.35" stroke-width="1"/>`;
  });
  $('#leaders').innerHTML = leaders;
}

// 칩끼리 겹치지 않도록 밀어내고, 원래 위치 쪽으로는 약하게 당긴다
function relax(chips, box) {
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = chips[i], b = chips[j];
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) {
          // 덜 겹친 축으로 밀어낸다
          if (ox < oy * 1.6) {
            const s = (a.x < b.x ? -1 : 1) * ox * 0.5;
            a.x += s; b.x -= s;
          } else {
            const s = (a.y < b.y ? -1 : 1) * oy * 0.5;
            a.y += s; b.y -= s;
          }
        }
      }
    }
    for (const c of chips) {
      c.x += (c.ax - c.x) * 0.02;
      c.y += (c.ay - c.y) * 0.02;
      c.x = Math.max(c.w / 2 + 4, Math.min(box.W - c.w / 2 - 4, c.x));
      c.y = Math.max(c.h / 2 + 4, Math.min(box.H - c.h / 2 - 4, c.y));
    }
  }
}

// ── 상세 ──
function chart(hours) {
  if (!hours.length) return '';
  const W = 340, H = 150, top = 22, bottom = 118, left = 10, right = W - 10;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const x = (i) => left + (i / (hours.length - 1)) * (right - left);
  const y = (t) => top + ((hi - t) / (hi - lo)) * (bottom - 40 - top);
  const pts = hours.map((h, i) => [x(i), y(h.temp)]);
  // 부드러운 곡선 (Catmull-Rom → Bezier)
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L${right} ${bottom - 36} L${left} ${bottom - 36}Z`;
  const bw = ((right - left) / hours.length) * 0.6;
  let bars = '', labels = '', xl = '';
  hours.forEach((h, i) => {
    const bh = (h.pop / 100) * 30;
    bars += `<rect x="${x(i) - bw / 2}" y="${bottom - bh}" width="${bw}" height="${bh}" rx="1.5" fill="#5ab0ff" opacity="${0.25 + h.pop / 160}"/>`;
    if (i % 3 === 0) {
      labels += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="2.6" fill="var(--accent)"/>
        <text class="tl" x="${pts[i][0]}" y="${pts[i][1] - 7}" text-anchor="middle">${h.temp}°</text>`;
      xl += `<text class="xl" x="${x(i)}" y="${H - 14}" text-anchor="middle">${h.hour === 0 ? '0시' : `${h.hour}시`}</text>`;
      if (h.pop >= 20) labels += `<text class="pl" x="${x(i)}" y="${bottom - bh - 3}" text-anchor="middle">${h.pop}%</text>`;
    }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity="0.35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#g-area)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>
    ${bars}${labels}${xl}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="var(--line)"/>
  </svg>`;
}

function dayName(dateStr, i) {
  const d = new Date(+dateStr.slice(0, 4), +dateStr.slice(4, 6) - 1, +dateStr.slice(6));
  const label = ['오늘', '내일', '모레'][i] || '';
  return `${label} <span class="muted" style="font-size:11px">${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}</span>`;
}

function renderDetail() {
  const p = places.find((x) => x.name === selected);
  const el = $('#detail');
  if (!p) { el.innerHTML = '<div class="empty">지도에서 도시를 선택하세요</div>'; return; }
  if (!p.ok) { el.innerHTML = `<div class="d-name">${esc(p.name)}</div><div class="empty">${esc(p.error)}</div>`; return; }
  const { current: c, hourly, daily, grid } = p.data;
  const t = daily[0] || {};
  const rainSum = hourly.slice(0, 24).map((h) => h.pcp).filter(Boolean);

  el.innerHTML = `
    <div class="d-head">
      <div>
        <div class="d-name">${esc(p.name)}</div>
        <div class="d-sub">${esc(p.region)} · 기상청 격자 ${grid.nx}, ${grid.ny}</div>
      </div>
    </div>
    <div class="d-now">
      ${weatherIcon(c.icon, 64)}
      <div>
        <div class="d-temp">${fmt(c.temp)}</div>
      </div>
      <div>
        <div class="d-desc">${esc(c.desc)}</div>
        <div class="d-mm">최고 <span class="hi">${fmt(t.max)}</span> · 최저 <span class="lo">${fmt(t.min)}</span></div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">습도</div><div class="val">${c.humidity}%</div></div>
      <div class="stat"><div class="k">바람</div><div class="val">${c.wind}<small>m/s</small></div></div>
      <div class="stat"><div class="k">1시간 강수</div><div class="val">${c.rain1h}<small>mm</small></div></div>
      <div class="stat"><div class="k">강수확률</div><div class="val">${t.pop ?? 0}%</div></div>
    </div>
    ${rainSum.length ? `<div class="d-sub">☔ 24시간 안에 강수 예보가 있어요: ${esc(rainSum.slice(0, 3).join(', '))}</div>` : ''}
    <div class="d-sec">24시간 기온 · 강수확률</div>
    ${chart(hourly.slice(0, 24))}
    <div class="d-sec">시간별 예보</div>
    <div class="hstrip">${hourly.slice(0, 24).map((h) => `
      <div class="h ${h.hour === 0 ? 'day' : ''}">
        <span class="muted">${h.hour === 0 ? '내일' : `${h.hour}시`}</span>
        ${weatherIcon(h.icon, 26)}
        <span class="t">${h.temp}°</span>
        <span class="p">${h.pop ? `${h.pop}%` : ''}</span>
        <span class="w">습도 ${h.humidity}%</span><span class="w">${h.wind}m/s</span>
      </div>`).join('')}</div>
    <div class="d-sec">3일 예보</div>
    <div class="days">${daily.map((d, i) => `
      <div class="day">
        <span>${dayName(d.date, i)}</span>
        ${weatherIcon(d.icon, 30)}
        <span class="p">☂ ${d.pop}%</span>
        <span class="mm"><span class="lo">${fmt(d.min)}</span> / <span class="hi">${fmt(d.max)}</span></span>
      </div>`).join('')}</div>`;
}

// ── 데이터 ──
async function load(force = false) {
  $('#status').textContent = '전국 날씨를 불러오는 중… (도시 23곳)';
  try {
    places = await widget.weatherNationwide(force);
  } catch (e) {
    $('#status').textContent = e.message;
    return;
  }
  const failed = places.filter((p) => !p.ok);
  $('#status').textContent = failed.length ? `${failed.length}곳을 불러오지 못했어요: ${failed[0].error}` : '';
  const at = places.find((p) => p.ok)?.data.updatedAt;
  const d = at ? new Date(at) : null;
  $('#updated').textContent = d ? `기상청 단기예보 · ${pad(d.getHours())}:${pad(d.getMinutes())} 기준` : '';
  renderMap();
  renderDetail();
}

$('#map').addEventListener('click', (e) => {
  const i = e.target.closest('.chip')?.dataset.i;
  if (i == null) return;
  selected = places[Number(i)].name;
  $$('.chip').forEach((c) => c.classList.toggle('on', c.dataset.i === i));
  renderDetail();
});
$('#metric').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  metric = v;
  $$('#metric button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  renderMap();
});
$('#refresh').addEventListener('click', () => load(true));
$('#close').addEventListener('click', () => widget.closeSelf());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') widget.closeSelf(); });

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => places.length && renderMap(), 80);
});

(async function init() {
  const c = await widget.getConfig();
  document.documentElement.dataset.theme = c.appearance.theme;
  document.documentElement.style.setProperty('--accent', c.appearance.accent);
  document.documentElement.style.setProperty('--glass', c.appearance.glass);
  widget.onConfigChanged((n) => {
    document.documentElement.dataset.theme = n.appearance.theme;
    document.documentElement.style.setProperty('--accent', n.appearance.accent);
  });
  load();
})();

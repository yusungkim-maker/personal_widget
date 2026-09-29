// 미세먼지·기상특보 표시 (날씨 카드, 컴팩트 모드, 뭉치 상황 정보, 설정)
let airData = [];
let warnData = { available: false, warnings: [] };

const DUST_CLASS = ['good', 'normal', 'bad', 'worst'];
const DUST_WORD = ['좋음', '보통', '나쁨', '매우나쁨'];

function dustBadge(a, { short = false } = {}) {
  if (!a?.ok || a.grade == null) return '';
  const g = (v) => (v == null ? '' : `<span class="dust-g ${DUST_CLASS[v]}">${DUST_WORD[v]}</span>`);
  const src = a.source === 'model' ? ' <span class="dust-src" title="Open-Meteo 대기질 예측값 (측정값 아님)">예측</span>' : '';
  const title = `미세먼지 ${a.pm10 ?? '-'}㎍/㎥ · 초미세먼지 ${a.pm25 ?? '-'}㎍/㎥${a.station ? ` · ${a.station} 측정소` : ''}`;
  return short
    ? `<span class="dust" title="${esc(title)}">${g(a.grade)}${src}</span>`
    : `<span class="dust" title="${esc(title)}">미세 ${g(a.grade10)} · 초미세 ${g(a.grade25)}${src}</span>`;
}

function renderAir() {
  for (const el of $$('[data-dust-row]')) el.innerHTML = dustBadge(airData.find((a) => a.name === el.dataset.dustRow));
  for (const el of $$('[data-dust]')) el.innerHTML = dustBadge(airData.find((a) => a.name === el.dataset.dust), { short: true });
  const box = $('#w-warn');
  if (!box) return;
  const w = warnData.warnings || [];
  box.hidden = !w.length;
  box.innerHTML = w.map((x) => `<div class="warn-row" title="${esc(x.text)}">⚠ <b>${esc(x.names.join(', '))}</b> · ${esc(x.regions.join(', '))}</div>`).join('');
}

async function loadAir() {
  if (!config.sections.weather) return;
  try {
    [airData, warnData] = await Promise.all([widget.weatherAir(), widget.weatherWarnings()]);
  } catch { /* 표시만 안 함 */ }
  renderAir();
  renderSummaries();
}

function airContextLines() {
  const lines = [];
  for (const a of airData.filter((x) => x.ok && x.grade != null)) {
    lines.push(`미세먼지(${a.name}): PM10 ${a.pm10}㎍/㎥ ${DUST_WORD[a.grade10] || '-'}, PM2.5 ${a.pm25}㎍/㎥ ${DUST_WORD[a.grade25] || '-'}${a.source === 'model' ? ' (예측값)' : ''}`);
  }
  for (const w of warnData.warnings || []) lines.push(`기상특보: ${w.names.join(', ')} (${w.regions.join(', ')})`);
  return lines;
}

// 설정: 사용 중인 자료 출처와 활용 신청 안내
async function renderAirSettings() {
  const st = await widget.weatherAirStatus();
  const usingModel = airData.some((a) => a.source === 'model') || !st.airKorea;
  const link = (kw) => `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent(kw)}`;
  $('#air-state').innerHTML = [
    usingModel
      ? `미세먼지: <b>Open-Meteo 예측값</b>으로 보여 주는 중이에요. 공공데이터포털에서 <a href="${link('에어코리아 대기오염정보')}" target="_blank">에어코리아 대기오염정보</a>와 <a href="${link('에어코리아 측정소정보')}" target="_blank">측정소정보</a>를 활용 신청하면 실제 측정값으로 바뀌어요.`
      : '미세먼지: <b>에어코리아 측정값</b>을 쓰고 있어요.',
    warnData.available
      ? '기상특보: <b>사용 중</b>이에요. 우리 지역에 특보가 있으면 날씨 카드 위에 떠요.'
      : `기상특보: <a href="${link('기상청 기상특보 조회서비스')}" target="_blank">기상청 기상특보 조회서비스</a>를 활용 신청하면 날씨 카드에 특보가 떠요.`,
  ].map((t) => `<span>${t}</span>`).join('');
}

$('#air-recheck').addEventListener('click', async () => {
  await widget.weatherAirRecheck();
  await loadAir();
  await renderAirSettings();
  toast('미세먼지·특보 연결을 다시 확인했어요');
});

// 날씨를 다시 그릴 때마다 미세먼지 배지도 채운다
{
  const original = window.renderWeather;
  window.renderWeather = function (...args) {
    const r = original.apply(this, args);
    renderAir();
    return r;
  };
}
setInterval(() => config && loadAir(), 30 * 60e3);

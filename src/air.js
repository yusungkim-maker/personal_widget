// 미세먼지·기상특보
//  - 미세먼지: 에어코리아(한국환경공단) 측정값 우선. 활용 신청 전이면 Open-Meteo 대기질 예측값으로 대신한다.
//  - 기상특보: 기상청 기상특보 조회서비스. 활용 신청 전이면 표시하지 않는다.
// 공공데이터포털 인증키는 계정마다 하나라서 기상청 단기예보 키를 그대로 쓴다 (서비스별 활용 신청은 따로 필요).
const AIRKOREA = 'https://apis.data.go.kr/B552584';
const KMA_WARN = 'https://apis.data.go.kr/1360000/WthrWrnInfoService';
const CACHE_MS = 30 * 60e3;
const NOT_REGISTERED_RETRY_MS = 6 * 3600e3; // 신청 전 키로 계속 두드리지 않는다

// 환경부 통합 기준 (µg/m³)
const PM10_STEPS = [30, 80, 150];
const PM25_STEPS = [15, 35, 75];
const GRADES = ['좋음', '보통', '나쁨', '매우나쁨'];
const gradeOf = (v, steps) => (Number.isFinite(v) ? steps.filter((s) => v > s).length : null);

const state = { airKoreaBlockedUntil: 0, warnBlockedUntil: 0, stations: new Map(), cache: new Map(), warnCache: null };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  if (/SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은 서비스키/.test(text)) {
    const e = new Error('NOT_REGISTERED');
    e.code = 'NOT_REGISTERED';
    throw e;
  }
  return JSON.parse(text);
}

const items = (j) => j?.response?.body?.items || [];
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' && v !== '-' ? n : null; };

function haversine(a, b) {
  const R = 6371, D = Math.PI / 180;
  const dLat = (b.lat - a.lat) * D, dLon = (b.lon - a.lon) * D;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 지역 이름으로 측정소를 찾고, 그중 가장 가까운 곳을 쓴다
async function nearestStation(key, place) {
  const id = `${place.name}:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
  if (state.stations.has(id)) return state.stations.get(id);
  const q = new URLSearchParams({ serviceKey: key, returnType: 'json', numOfRows: '100', pageNo: '1', addr: place.name });
  const list = items(await getJson(`${AIRKOREA}/MsrstnInfoInqireSvc/getMsrstnList?${q}`));
  let best = null;
  for (const s of list) {
    // dmX·dmY 중 어느 쪽이 위도인지 값의 범위로 판단한다
    const x = toNum(s.dmX), y = toNum(s.dmY);
    if (x == null || y == null) continue;
    const [lat, lon] = x < 90 ? [x, y] : [y, x];
    const d = haversine({ lat: place.latitude, lon: place.longitude }, { lat, lon });
    if (!best || d < best.d) best = { name: s.stationName, d };
  }
  const name = best?.name || null;
  state.stations.set(id, name);
  return name;
}

async function fromAirKorea(key, place) {
  const station = await nearestStation(key, place);
  if (!station) return null;
  const q = new URLSearchParams({ serviceKey: key, returnType: 'json', numOfRows: '1', pageNo: '1', stationName: station, dataTerm: 'DAILY', ver: '1.3' });
  const it = items(await getJson(`${AIRKOREA}/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?${q}`))[0];
  if (!it) return null;
  return { pm10: toNum(it.pm10Value), pm25: toNum(it.pm25Value), time: it.dataTime || '', source: 'airkorea', station };
}

async function fromOpenMeteo(place) {
  const q = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, current: 'pm10,pm2_5', timezone: 'Asia/Seoul' });
  const j = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`);
  const c = j.current || {};
  return { pm10: toNum(c.pm10), pm25: toNum(c.pm2_5), time: c.time || '', source: 'model', station: null };
}

function withGrades(r) {
  const g10 = gradeOf(r.pm10, PM10_STEPS), g25 = gradeOf(r.pm25, PM25_STEPS);
  const worst = Math.max(g10 ?? -1, g25 ?? -1);
  return { ...r, grade10: g10, grade25: g25, grade: worst >= 0 ? worst : null, label: worst >= 0 ? GRADES[worst] : '-' };
}

async function airFor(key, place) {
  const id = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  const hit = state.cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let r = null;
  if (key && Date.now() > state.airKoreaBlockedUntil) {
    try {
      r = await fromAirKorea(key, place);
    } catch (e) {
      if (e.code === 'NOT_REGISTERED') state.airKoreaBlockedUntil = Date.now() + NOT_REGISTERED_RETRY_MS;
    }
  }
  if (!r || (r.pm10 == null && r.pm25 == null)) r = await fromOpenMeteo(place);
  const value = withGrades(r);
  state.cache.set(id, { at: Date.now(), value });
  return value;
}

async function fetchAir(key, places) {
  return Promise.all(places.map(async (p) => {
    try {
      return { name: p.name, ok: true, ...(await airFor(key, p)) };
    } catch {
      return { name: p.name, ok: false };
    }
  }));
}

// ── 기상특보 ──
// 특보 현황 글에서 "호우주의보", "폭염경보" 같은 이름과, 우리 지역이 들어간 줄을 뽑는다.
function parseWarnings(list, regions) {
  const texts = list.map((it) => Object.values(it).filter((v) => typeof v === 'string').join('\n')).join('\n');
  const out = [];
  for (const line of texts.split(/\n|o\s+/)) {
    const names = [...new Set(line.match(/[가-힣]+(?:주의보|경보)/g) || [])];
    if (!names.length) continue;
    const hit = regions.filter((r) => line.includes(r));
    if (hit.length) out.push({ names, regions: hit, text: line.trim().slice(0, 300) });
  }
  return out;
}

async function fetchWarnings(key, regions) {
  if (!key) return { available: false, reason: 'no_key', warnings: [] };
  if (Date.now() < state.warnBlockedUntil) return { available: false, reason: 'not_registered', warnings: [] };
  if (state.warnCache && Date.now() - state.warnCache.at < CACHE_MS) return state.warnCache.value;
  try {
    const q = new URLSearchParams({ serviceKey: key, dataType: 'JSON', numOfRows: '10', pageNo: '1' });
    const j = await getJson(`${KMA_WARN}/getPwnStatus?${q}`);
    const code = j?.response?.header?.resultCode;
    // 03 = 데이터 없음 (발효 중인 특보가 없음)
    const list = code === '00' ? (j.response.body.items.item || []) : [];
    const value = { available: true, warnings: parseWarnings(list, regions) };
    state.warnCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    if (e.code === 'NOT_REGISTERED') {
      state.warnBlockedUntil = Date.now() + NOT_REGISTERED_RETRY_MS;
      return { available: false, reason: 'not_registered', warnings: [] };
    }
    return { available: false, reason: 'error', warnings: [] };
  }
}

// 설정 화면에서 "신청했어요, 다시 확인" 을 누르면 차단을 풀고 다시 시도한다
function resetBlocks() {
  state.airKoreaBlockedUntil = 0;
  state.warnBlockedUntil = 0;
  state.cache.clear();
  state.stations.clear();
  state.warnCache = null;
}

const status = () => ({
  airKorea: Date.now() > state.airKoreaBlockedUntil,
  warnings: Date.now() > state.warnBlockedUntil,
});

module.exports = { fetchAir, fetchWarnings, resetBlocks, status, _internal: { gradeOf, parseWarnings, PM10_STEPS, PM25_STEPS } };

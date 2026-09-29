// 기상청 단기예보 조회서비스 (VilageFcstInfoService_2.0)
//  - getUltraSrtNcst : 초단기실황 (현재 기온/습도/바람/강수형태)
//  - getUltraSrtFcst : 초단기예보 (현재 하늘상태)
//  - getVilageFcst   : 단기예보 (시간별·일별 예보, 최저/최고기온)
const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

// ── 위경도 → 기상청 격자 좌표 (Lambert Conformal Conic, 기상청 제공 공식) ──
function toGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// ── 발표 시각 계산 (항상 한국 시간 기준) ──
const pad = (n) => String(n).padStart(2, '0');
function kst(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), t: date.getTime() };
}
const ymdOf = (k) => `${k.y}${pad(k.m)}${pad(k.d)}`;
const hoursAgo = (h) => kst(new Date(Date.now() - h * 3600e3));

function ncstBase() {
  // 매시 정시 발표, 약 40분 이후 제공
  const k = kst();
  const b = k.min >= 45 ? k : hoursAgo(1);
  return { base_date: ymdOf(b), base_time: `${pad(b.h)}00` };
}

function ultraFcstBase() {
  // 매시 30분 발표, 약 45분 이후 제공
  const k = kst();
  const b = k.min >= 50 ? k : hoursAgo(1);
  return { base_date: ymdOf(b), base_time: `${pad(b.h)}30` };
}

function vilageBase() {
  // 02,05,08,11,14,17,20,23시 발표, 약 10분 이후 제공
  const k = kst();
  const mins = k.h * 60 + k.min;
  const hours = [2, 5, 8, 11, 14, 17, 20, 23].filter((h) => mins >= h * 60 + 15);
  if (!hours.length) return { base_date: ymdOf(hoursAgo(24)), base_time: '2300' };
  return { base_date: ymdOf(k), base_time: `${pad(hours.at(-1))}00` };
}

// 오늘 최저/최고기온(TMN/TMX)은 02시 발표분에 모두 들어 있다.
function todayMinMaxBase() {
  const k = kst();
  if (k.h * 60 + k.min >= 2 * 60 + 15) return { base_date: ymdOf(k), base_time: '0200' };
  return { base_date: ymdOf(hoursAgo(24)), base_time: '2300' };
}

// ── 호출 ──
async function call(op, key, params) {
  const qs = new URLSearchParams({
    serviceKey: key, pageNo: '1', numOfRows: '1000', dataType: 'JSON', ...params,
  });
  const res = await fetch(`${BASE}/${op}?${qs}`, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증 오류 등은 JSON 요청이어도 XML로 온다
    const msg = text.match(/<returnAuthMsg>([^<]+)/)?.[1] || text.match(/<resultMsg>([^<]+)/)?.[1] || `HTTP ${res.status}`;
    if (/SERVICE_KEY|SERVICE KEY/i.test(msg)) throw new Error('기상청 인증키가 올바르지 않거나 아직 활성화되지 않았습니다.');
    throw new Error(`기상청 응답 오류: ${msg}`);
  }
  const header = json.response?.header;
  if (header?.resultCode !== '00') throw new Error(`기상청 응답 오류: ${header?.resultMsg || '알 수 없음'}`);
  return json.response.body.items.item || [];
}

// ── 코드 해석 ──
const SKY = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const PTY = { 1: '비', 2: '비/눈', 3: '눈', 4: '소나기', 5: '빗방울', 6: '빗방울눈날림', 7: '눈날림' };

// 렌더러 아이콘 키: clear | partly | cloudy | rain | snow | sleet | shower
function iconOf(sky, pty) {
  pty = Number(pty) || 0;
  if (pty === 1 || pty === 5) return 'rain';
  if (pty === 2 || pty === 6) return 'sleet';
  if (pty === 3 || pty === 7) return 'snow';
  if (pty === 4) return 'shower';
  return { 1: 'clear', 3: 'partly', 4: 'cloudy' }[Number(sky)] || 'partly';
}
const describe = (sky, pty) => PTY[Number(pty)] || SKY[Number(sky)] || '-';

function group(items, valueKey) {
  // { 'YYYYMMDDHHMM': { TMP: '12', SKY: '1', ... } }
  const out = {};
  for (const it of items) {
    const k = `${it.fcstDate}${it.fcstTime}`;
    (out[k] ||= { date: it.fcstDate, time: it.fcstTime })[it.category] = it[valueKey];
  }
  return Object.values(out).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

async function fetchWeather({ key, latitude, longitude, hours = 24 }) {
  if (!key) throw new Error('설정에서 기상청 인증키를 입력해 주세요.');
  const grid = toGrid(latitude, longitude);
  const loc = { nx: String(grid.nx), ny: String(grid.ny) };

  const [ncst, ultra, vilage, mm] = await Promise.all([
    call('getUltraSrtNcst', key, { ...ncstBase(), ...loc }),
    call('getUltraSrtFcst', key, { ...ultraFcstBase(), ...loc }).catch(() => []),
    call('getVilageFcst', key, { ...vilageBase(), ...loc }),
    call('getVilageFcst', key, { ...todayMinMaxBase(), ...loc }).catch(() => []),
  ]);

  // 현재
  const now = Object.fromEntries(ncst.map((i) => [i.category, i.obsrValue]));
  const ultraSlots = group(ultra, 'fcstValue');
  const hourly = group(vilage, 'fcstValue');
  const sky = ultraSlots[0]?.SKY ?? hourly[0]?.SKY;
  const current = {
    temp: Number(now.T1H),
    humidity: Number(now.REH),
    wind: Number(now.WSD),
    rain1h: Number(now.RN1) || 0,
    icon: iconOf(sky, now.PTY),
    desc: describe(sky, now.PTY),
  };

  // 시간별 (앞으로 hours 시간)
  const today = ymdOf(kst());
  const nowKey = `${today}${pad(kst().h)}00`;
  const nextHours = hourly.filter((s) => s.date + s.time > nowKey && s.TMP != null).slice(0, hours).map((s) => ({
    hour: Number(s.time.slice(0, 2)),
    date: s.date,
    temp: Number(s.TMP),
    pop: Number(s.POP) || 0,
    pcp: s.PCP && s.PCP !== '강수없음' ? s.PCP : '',
    humidity: Number(s.REH) || 0,
    wind: Number(s.WSD) || 0,
    icon: iconOf(s.SKY, s.PTY),
    desc: describe(s.SKY, s.PTY),
  }));

  // 일별 (오늘/내일/모레)
  const all = [...group(mm, 'fcstValue'), ...hourly];
  const byDay = {};
  for (const s of all) {
    const d = (byDay[s.date] ||= { temps: [], pops: [], tmn: null, tmx: null, slots: [] });
    if (s.TMP != null) d.temps.push(Number(s.TMP));
    if (s.POP != null) d.pops.push(Number(s.POP));
    if (s.TMN != null) d.tmn = Number(s.TMN);
    if (s.TMX != null) d.tmx = Number(s.TMX);
    d.slots.push(s);
  }
  if (byDay[today] && Number.isFinite(current.temp)) byDay[today].temps.push(current.temp);
  const daily = Object.keys(byDay).filter((d) => d >= today).sort().slice(0, 3).map((date) => {
    const d = byDay[date];
    // 낮 12~15시의 하늘/강수 상태를 그날의 대표로 쓴다
    const noon = d.slots.find((s) => s.time === '1200' && s.SKY) || d.slots.find((s) => s.SKY) || {};
    const rainy = d.slots.find((s) => Number(s.PTY) > 0);
    return {
      date,
      min: d.tmn ?? (d.temps.length ? Math.min(...d.temps) : null),
      max: d.tmx ?? (d.temps.length ? Math.max(...d.temps) : null),
      pop: d.pops.length ? Math.max(...d.pops) : 0,
      icon: iconOf(noon.SKY, rainy ? rainy.PTY : noon.PTY),
    };
  });

  return { current, hourly: nextHours, daily, grid, updatedAt: new Date().toISOString() };
}

// 지역 이름 → 위경도 (OpenStreetMap Nominatim, 한국 지명 검색이 정확하다)
const PLACE_TYPES = new Set(['province', 'state', 'city', 'county', 'borough', 'town', 'village',
  'municipality', 'suburb', 'quarter', 'neighbourhood', 'city_district', 'district', 'hamlet', 'legal']);

async function searchCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: name, format: 'jsonv2', countrycodes: 'kr', 'accept-language': 'ko', limit: '10',
  })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YuskWidget/1.0 (personal desktop widget)' },
    signal: AbortSignal.timeout(10000),
  });
  const list = await res.json();
  const places = list.filter((r) => PLACE_TYPES.has(r.addresstype));
  return (places.length ? places : list).slice(0, 6).map((r) => {
    const parts = r.display_name.split(',').map((s) => s.trim()).filter((s) => s && s !== '대한민국' && !/^\d+$/.test(s));
    return {
      name: parts[0] || name,
      region: parts.slice(1, 3).join(' '),
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    };
  });
}

// ── 캐시 (같은 격자는 20분 동안 다시 부르지 않는다) ──
const CACHE_MS = 20 * 60e3;
const cache = new Map();

function cachedWeather(key, place, force = false) {
  const { nx, ny } = toGrid(place.latitude, place.longitude);
  const id = `${nx},${ny}`;
  const hit = cache.get(id);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetchWeather({ key, latitude: place.latitude, longitude: place.longitude });
  cache.set(id, { at: Date.now(), promise });
  promise.catch(() => cache.delete(id));
  return promise;
}

async function fetchPlaces(key, places, force = false) {
  // 공공데이터포털 과부하를 피하려고 동시에 4곳까지만 요청한다
  const out = new Array(places.length);
  let next = 0;
  async function worker() {
    while (next < places.length) {
      const i = next++;
      try {
        out[i] = { ...places[i], ok: true, data: await cachedWeather(key, places[i], force) };
      } catch (e) {
        out[i] = { ...places[i], ok: false, error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

// 전국 날씨에 표시할 주요 도시
const NATIONWIDE = [
  { name: '서울', region: '수도권', latitude: 37.5665, longitude: 126.978 },
  { name: '인천', region: '수도권', latitude: 37.4563, longitude: 126.7052 },
  { name: '수원', region: '수도권', latitude: 37.2636, longitude: 127.0286 },
  { name: '성남', region: '수도권', latitude: 37.42, longitude: 127.1267 },
  { name: '춘천', region: '강원', latitude: 37.8813, longitude: 127.7298 },
  { name: '강릉', region: '강원', latitude: 37.7519, longitude: 128.8761 },
  { name: '울릉도', region: '경상', latitude: 37.4845, longitude: 130.9057 },
  { name: '천안', region: '충청', latitude: 36.8151, longitude: 127.1139 },
  { name: '청주', region: '충청', latitude: 36.6424, longitude: 127.489 },
  { name: '세종', region: '충청', latitude: 36.48, longitude: 127.289 },
  { name: '대전', region: '충청', latitude: 36.3504, longitude: 127.3845 },
  { name: '안동', region: '경상', latitude: 36.5684, longitude: 128.7294 },
  { name: '포항', region: '경상', latitude: 36.019, longitude: 129.3435 },
  { name: '대구', region: '경상', latitude: 35.8714, longitude: 128.6014 },
  { name: '전주', region: '전라', latitude: 35.8242, longitude: 127.148 },
  { name: '울산', region: '경상', latitude: 35.5384, longitude: 129.3114 },
  { name: '창원', region: '경상', latitude: 35.228, longitude: 128.6811 },
  { name: '부산', region: '경상', latitude: 35.1796, longitude: 129.0756 },
  { name: '광주', region: '전라', latitude: 35.1595, longitude: 126.8526 },
  { name: '목포', region: '전라', latitude: 34.8118, longitude: 126.3922 },
  { name: '여수', region: '전라', latitude: 34.7604, longitude: 127.6622 },
  { name: '제주', region: '제주', latitude: 33.4996, longitude: 126.5312 },
  { name: '서귀포', region: '제주', latitude: 33.2541, longitude: 126.5601 },
];

module.exports = { fetchWeather, fetchPlaces, searchCity, toGrid, NATIONWIDE };

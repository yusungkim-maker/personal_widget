const test = require('node:test');
const assert = require('node:assert');

// 2026-09-30 10:50 KST 로 시간을 고정하고, 기상청 응답을 흉내 낸다
const FIXED = Date.UTC(2026, 8, 30, 1, 50);
const realNow = Date.now;

function item(cat, date, time, value, extra = {}) {
  return { category: cat, fcstDate: date, fcstTime: time, fcstValue: String(value), ...extra };
}

// 02시 발표는 18시 강수확률 80%, 최신(08시) 발표는 20% 로 낮춤
function vilage(baseTime) {
  const pop18 = baseTime === '0200' ? 80 : 20;
  const hours = ['1000', '1100', '1200', '1500', '1800', '2100'];
  const items = [];
  for (const t of hours) {
    items.push(item('TMP', '20260930', t, 22), item('SKY', '20260930', t, 1), item('PTY', '20260930', t, 0));
    items.push(item('POP', '20260930', t, t === '1800' ? pop18 : t === '1000' ? 10 : 0));
  }
  if (baseTime === '0200') items.push(item('TMN', '20260930', '0600', 15), item('TMX', '20260930', '1500', 26));
  return items;
}

function respond(url) {
  const u = new URL(url);
  const op = u.pathname.split('/').pop();
  const bt = u.searchParams.get('base_time');
  let items = [];
  if (op === 'getUltraSrtNcst') {
    if (bt === '1000') items = ['T1H:22.8', 'REH:61', 'WSD:1.5', 'RN1:0', 'PTY:0'].map((kv) => ({ category: kv.split(':')[0], obsrValue: kv.split(':')[1], baseDate: '20260930', baseTime: '1000' }));
  } else if (op === 'getUltraSrtFcst') {
    if (bt === '1030') items = [item('SKY', '20260930', '1100', 1)];
  } else if (op === 'getVilageFcst') {
    if (['0800', '0200'].includes(bt)) items = vilage(bt);
  }
  const body = items.length
    ? { response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { items: { item: items } } } }
    : { response: { header: { resultCode: '03', resultMsg: 'NO_DATA' } } };
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

test('강수확률: 최신 발표만 쓰고, 옛 발표의 높은 확률이 남지 않는다', async () => {
  Date.now = () => FIXED;
  const realFetch = global.fetch;
  global.fetch = async (url) => respond(url);
  try {
    const { fetchWeather } = require('../src/weather');
    const r = await fetchWeather({ key: 'k', latitude: 37.5665, longitude: 126.978 });
    assert.strictEqual(r.observedAt, '2026-09-30T10:00', '가장 최신 정시 관측(10:00)을 쓴다');
    assert.strictEqual(r.current.pop, 10, '지금(10:50) 은 이번 시간(10시 칸) 강수확률');
    assert.strictEqual(r.daily[0].pop, 20, '02시 발표의 80%가 아니라 최신 발표의 20%');
    assert.strictEqual(r.daily[0].popHour, 18);
    assert.deepStrictEqual([r.daily[0].min, r.daily[0].max], [15, 26], '최저·최고는 02시 발표에서');
  } finally {
    global.fetch = realFetch;
    Date.now = realNow;
  }
});

const test = require('node:test');
const assert = require('node:assert');
const { gradeOf, parseWarnings, PM10_STEPS, PM25_STEPS } = require('../src/air')._internal;

test('미세먼지 등급 (환경부 통합 기준)', () => {
  assert.deepStrictEqual([0, 30, 31, 80, 81, 150, 151].map((v) => gradeOf(v, PM10_STEPS)), [0, 0, 1, 1, 2, 2, 3]);
  assert.deepStrictEqual([10, 15, 16, 35, 36, 75, 76].map((v) => gradeOf(v, PM25_STEPS)), [0, 0, 1, 1, 2, 2, 3]);
  assert.strictEqual(gradeOf(null, PM10_STEPS), null);
});

test('특보 글에서 우리 지역에 걸린 특보만 뽑는다', () => {
  const list = [{ t6: 'o 호우주의보 : 서울, 경기도(성남, 수원)\no 폭염경보 : 대구, 경상북도\no 강풍주의보 : 제주도' }];
  const w = parseWarnings(list, ['서울', '성남']);
  assert.strictEqual(w.length, 1);
  assert.deepStrictEqual(w[0].names, ['호우주의보']);
  assert.deepStrictEqual(w[0].regions, ['서울', '성남']);
  assert.strictEqual(parseWarnings(list, ['부산']).length, 0);
});

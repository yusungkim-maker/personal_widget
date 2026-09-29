const test = require('node:test');
const assert = require('node:assert');
const NL = require('../src/renderer/nlparse');

// 기준: 2026-09-29 (화) 10:00
const now = new Date(2026, 8, 29, 10, 0);
const p = (text, base) => NL.parse(text, { now, base });

test('상대 날짜 + 오후 추정 + 기본 1시간', () => {
  const r = p('내일 3시 치과');
  assert.deepStrictEqual([r.title, r.startDay, r.startTime, r.endTime, r.allDay], ['치과', '2026-09-30', '15:00', '16:00', false]);
});

test('오전/오후, 분, 반', () => {
  assert.strictEqual(p('오전 10시 30분 스탠드업').startTime, '10:30');
  assert.strictEqual(p('모레 오후 2시 반 미팅').startTime, '14:30');
  assert.strictEqual(p('모레 오후 2시 반 미팅').startDay, '2026-10-01');
  assert.strictEqual(p('저녁 7시 회식').startTime, '19:00');
  assert.strictEqual(p('14:00 리뷰').startTime, '14:00');
});

test('시간 범위와 기간', () => {
  const r = p('금요일 2시~4시 크리 미팅');
  assert.deepStrictEqual([r.title, r.startDay, r.startTime, r.endTime], ['크리 미팅', '2026-10-02', '14:00', '16:00']);
  const r2 = p('오후 2시부터 5시까지 워크숍');
  assert.deepStrictEqual([r2.title, r2.startTime, r2.endTime], ['워크숍', '14:00', '17:00']);
  assert.strictEqual(p('10시 회의 2시간').endTime, '12:00');
  assert.strictEqual(p('3시 통화 30분 동안').endTime, '15:30');
});

test('요일: 가장 가까운 요일, 이번 주, 다음 주', () => {
  assert.strictEqual(p('화요일 점검').startDay, '2026-09-29'); // 오늘
  assert.strictEqual(p('월요일 회고').startDay, '2026-10-05');
  assert.strictEqual(p('이번주 월요일 회고').startDay, '2026-09-28');
  assert.strictEqual(p('다음주 수요일 출장').startDay, '2026-10-07');
  assert.strictEqual(p('주말 캠핑').startDay, '2026-10-03');
});

test('절대 날짜', () => {
  assert.strictEqual(p('10월 9일 한글날 행사').startDay, '2026-10-09');
  assert.strictEqual(p('10/15 보고').startDay, '2026-10-15');
  assert.strictEqual(p('2027-01-02 신년회').startDay, '2027-01-02');
  assert.strictEqual(p('15일 정산').startDay, '2026-10-15'); // 이번 달 15일은 지났으므로 다음 달
  assert.strictEqual(p('3일 후 마감').startDay, '2026-10-02');
});

test('시간이 없으면 종일, 명시적 종일', () => {
  const r = p('다음주 월요일 워크숍');
  assert.strictEqual(r.allDay, true);
  assert.strictEqual(p('9/30 종일 교육').allDay, true);
  assert.strictEqual(p('9/30 종일 교육').title, '교육');
});

test('날짜가 없으면 달력에서 선택한 날을 쓴다', () => {
  const r = p('4시 통화', new Date(2026, 9, 12));
  assert.deepStrictEqual([r.startDay, r.startTime, r.hasDate], ['2026-10-12', '16:00', false]);
});

test('장소 @, 할 일의 "까지"', () => {
  const r = p('내일 11시 고객 미팅 @강남역');
  assert.deepStrictEqual([r.title, r.location], ['고객 미팅', '강남역']);
  const t = p('금요일까지 보고서 제출');
  assert.deepStrictEqual([t.title, t.startDay, t.allDay], ['보고서 제출', '2026-10-02', true]);
});

test('날짜·시간이 없는 문장은 그대로 제목', () => {
  const r = p('신규 캠페인 컬러 리마스터');
  assert.deepStrictEqual([r.title, r.hasDate, r.hasTime], ['신규 캠페인 컬러 리마스터', false, false]);
});

test('미리보기 문구', () => {
  assert.strictEqual(NL.describe(p('내일 3시 치과'), now), '9월 30일 (수) · 내일 오후 3:00–4:00');
  assert.strictEqual(NL.describe(p('오전 11시~오후 1시 점심 미팅'), now), '9월 29일 (화) · 오늘 오전 11:00–오후 1:00');
  assert.strictEqual(NL.describe(p('10/15 보고'), now), '10월 15일 (목) 종일');
});

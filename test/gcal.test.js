const test = require('node:test');
const assert = require('node:assert');
const { toGoogle, fromGoogle } = require('../src/gcal-format');

test('시간 일정 → 구글: 로컬 시간 + 시간대, 기본 알림', () => {
  const b = toGoogle({ title: ' 치과 ', startDay: '2026-09-30', allDay: false, startTime: '15:00', endTime: '16:00', location: '강남역', reminder: null });
  assert.strictEqual(b.summary, '치과');
  assert.strictEqual(b.start.dateTime, '2026-09-30T15:00:00');
  assert.strictEqual(b.end.dateTime, '2026-09-30T16:00:00');
  assert.ok(b.start.timeZone);
  assert.strictEqual(b.location, '강남역');
  assert.deepStrictEqual(b.reminders, { useDefault: true });
});

test('종일 일정 → 구글: 끝 날짜는 다음 날(배타적)', () => {
  const b = toGoogle({ title: '워크숍', startDay: '2026-10-05', endDay: '2026-10-06', allDay: true });
  assert.deepStrictEqual(b.start, { date: '2026-10-05' });
  assert.deepStrictEqual(b.end, { date: '2026-10-07' });
  const month = toGoogle({ title: '월말', startDay: '2026-10-31', allDay: true });
  assert.deepStrictEqual(month.end, { date: '2026-11-01' });
});

test('알림: 없음 / n분 전', () => {
  assert.deepStrictEqual(toGoogle({ title: 'a', startDay: '2026-10-01', allDay: true, reminder: -1 }).reminders, { useDefault: false, overrides: [] });
  assert.deepStrictEqual(toGoogle({ title: 'a', startDay: '2026-10-01', allDay: true, reminder: 30 }).reminders,
    { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
});

test('빈 제목은 (제목 없음)', () => {
  assert.strictEqual(toGoogle({ title: '   ', startDay: '2026-10-01', allDay: true }).summary, '(제목 없음)');
});

test('구글 → 위젯: 종일 일정의 배타적 끝 날짜를 되돌린다', () => {
  const e = fromGoogle({ id: 'abc', summary: '휴가', start: { date: '2026-10-05' }, end: { date: '2026-10-07' }, organizer: { self: true } });
  assert.deepStrictEqual([e.gid, e.startDay, e.endDay, e.allDay, e.editable], ['abc', '2026-10-05', '2026-10-06', true, true]);
});

test('구글 → 위젯: 시간 일정, 초대받은 일정은 수정 불가', () => {
  const e = fromGoogle({
    id: 'x', summary: '회의', start: { dateTime: '2026-09-30T15:00:00+09:00' }, end: { dateTime: '2026-09-30T16:00:00+09:00' },
    organizer: { email: 'boss@example.com' }, creator: { email: 'boss@example.com' }, reminders: { useDefault: false, overrides: [{ minutes: 10 }] },
  });
  assert.strictEqual(e.allDay, false);
  assert.strictEqual(e.editable, false);
  assert.strictEqual(e.reminder, 10);
  assert.strictEqual(fromGoogle({ id: 'y', start: { date: '2026-10-01' }, end: { date: '2026-10-02' }, organizer: { email: 'b', }, guestsCanModify: true }).editable, true);
  assert.strictEqual(new Date(e.start).toISOString(), '2026-09-30T06:00:00.000Z');
});

test('왕복 변환: 위젯 → 구글 → 위젯', () => {
  const input = { title: '크리 미팅', startDay: '2026-10-02', allDay: false, startTime: '14:00', endTime: '16:00', location: '회의실', reminder: 30 };
  const b = toGoogle(input);
  const back = fromGoogle({ id: 'r', ...b, start: { dateTime: `${b.start.dateTime}+09:00` }, end: { dateTime: `${b.end.dateTime}+09:00` }, organizer: { self: true } });
  assert.deepStrictEqual([back.title, back.startDay, back.location, back.reminder], ['크리 미팅', '2026-10-02', '회의실', 30]);
});

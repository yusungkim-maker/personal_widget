// 위젯 일정 ↔ Google Calendar API 일정 변환 (순수 함수, 테스트 대상)
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (dayStr, n) => {
  const [y, m, d] = dayStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
const TZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

// 구글 일정 → 위젯 일정 형태
function fromGoogle(e) {
  const allDay = !!e.start?.date;
  const start = allDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime);
  const end = allDay ? new Date(`${addDays(e.end.date, -1)}T23:59:59`) : new Date(e.end?.dateTime || e.start.dateTime);
  return {
    id: e.id,
    gid: e.id,
    title: e.summary || '(제목 없음)',
    start: start.toISOString(),
    end: end.toISOString(),
    startDay: allDay ? e.start.date : ymd(start),
    endDay: allDay ? addDays(e.end.date, -1) : ymd(end),
    allDay,
    location: e.location || '',
    description: e.description || '',
    reminder: e.reminders?.useDefault === false ? (e.reminders.overrides?.[0]?.minutes ?? -1) : null,
    holiday: false,
    // 구글은 organizer.self 를 true 일 때만 보내므로, 초대받은 일정에는 이 값이 없다
    editable: e.status !== 'cancelled' && !!(e.organizer?.self || e.creator?.self || e.guestsCanModify),
    source: 'google',
    htmlLink: e.htmlLink,
  };
}

// 위젯 입력값 → 구글 일정 본문
function toGoogle(input) {
  const body = {
    summary: String(input.title || '').trim().slice(0, 500) || '(제목 없음)',
    location: String(input.location || '').trim().slice(0, 500),
    description: String(input.description || '').trim().slice(0, 4000),
  };
  if (input.allDay) {
    body.start = { date: input.startDay };
    body.end = { date: addDays(input.endDay || input.startDay, 1) };
  } else {
    body.start = { dateTime: `${input.startDay}T${input.startTime}:00`, timeZone: TZ() };
    body.end = { dateTime: `${input.endDay || input.startDay}T${input.endTime}:00`, timeZone: TZ() };
  }
  // reminder: null = 캘린더 기본 알림, -1 = 알림 없음, n = n분 전
  if (input.reminder == null) body.reminders = { useDefault: true };
  else if (input.reminder < 0) body.reminders = { useDefault: false, overrides: [] };
  else body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: Number(input.reminder) }] };
  return body;
}

module.exports = { fromGoogle, toGoogle, addDays };

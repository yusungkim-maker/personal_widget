// 구글 캘린더(비공개 iCal 주소)와 대한민국 공휴일 캘린더를 읽어 일정 목록으로 만든다.
const ical = require('node-ical');

const KR_HOLIDAYS =
  'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';

// flex(HR) 가 구글 캘린더로 보내는 휴가·근무 일정은 제목으로 알아본다
const FLEX_TITLE = /연차|반차|반반차|시간차|휴가|병가|경조|공가|재택|원격|외근|출장/;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 종일 일정은 "날짜"만 의미가 있으므로 UTC 기준 날짜를 로컬 자정으로 옮긴다.
function allDayLocal(d) {
  if (d.getHours() === 0 && d.getMinutes() === 0) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function readSource(url, holiday, from, to) {
  const data = await ical.async.fromURL(url);
  const calName = data.vcalendar?.['WR-CALNAME'] || null;
  const out = [];
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true });
    } catch {
      continue;
    }
    for (const inst of instances) {
      const allDay = !!inst.isFullDay;
      let start = new Date(inst.start);
      let end = inst.end ? new Date(inst.end) : new Date(start);
      if (allDay) {
        start = allDayLocal(start);
        end = allDayLocal(end);
        end = new Date(end.getTime() - 1); // 종일 일정의 DTEND 는 다음 날이므로 하루 당긴다
        if (end < start) end = start;
      }
      if (end < from || start > to) continue;
      const title = String(inst.summary?.val ?? inst.summary ?? '(제목 없음)');
      out.push({
        id: `${ev.uid}-${start.getTime()}`,
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        startDay: ymd(start),
        endDay: ymd(end),
        allDay,
        location: ev.location ? String(ev.location?.val ?? ev.location) : '',
        holiday,
        flex: !holiday && FLEX_TITLE.test(title),
        calendar: calName,
      });
    }
  }
  return out;
}

// 비공개 iCal 주소에서 캘린더 ID(보통 이메일)를 꺼낸다
function icalCalendarId(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/')[3] || '').toLowerCase();
  } catch {
    return '';
  }
}

async function fetchEvents({ icalUrls = [], koreanHolidays = true }, from, to, google = null) {
  const skip = (google?.email || '').toLowerCase();
  const sources = icalUrls.filter(Boolean)
    .filter((u) => !skip || icalCalendarId(u.trim()) !== skip)
    .map((u) => ({ url: u.trim(), holiday: false }));
  if (koreanHolidays) sources.push({ url: KR_HOLIDAYS, holiday: true });

  const errors = [];
  const results = await Promise.all(sources.map(async (s) => {
    try {
      return await readSource(s.url, s.holiday, from, to);
    } catch (e) {
      errors.push(s.holiday ? '공휴일 캘린더를 불러오지 못했습니다.' : `캘린더 읽기 실패: ${e.message}`);
      return [];
    }
  }));
  if (google) {
    try {
      const list = await google.list(from, to);
      results.push(list.map((e) => ({ ...e, flex: FLEX_TITLE.test(e.title) })));
    } catch (e) {
      errors.push(`구글 캘린더: ${e.message}`);
    }
  }
  const events = results.flat().sort((a, b) => a.start.localeCompare(b.start));
  return { events, errors, googleConnected: !!google };
}

module.exports = { fetchEvents };

// 한국어 일정 문장 해석기: "내일 오후 3시 치과", "금요일 2시~4시 크리 미팅 @회의실", "9/30 종일 워크숍"
// 브라우저(window.NL)와 Node(require) 양쪽에서 쓴다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PM = /^(오후|저녁|밤)$/;
  const AM = /^(오전|아침|새벽)$/;

  // 매칭된 구간을 기록해 두었다가 제목에서 지운다
  function makeCursor(text) {
    const spans = [];
    return {
      text,
      find(re) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          const s = m.index, e = s + m[0].length;
          if (!spans.some(([a, b]) => s < b && e > a)) return m;
          if (!re.global) return null;
        }
        return null;
      },
      take(m) { spans.push([m.index, m.index + m[0].length]); },
      rest() {
        let out = '';
        let last = 0;
        for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) { out += `${text.slice(last, a)} `; last = b; }
        return out + text.slice(last);
      },
    };
  }

  function to24(h, min, period) {
    if (period && PM.test(period) && h < 12) h += 12;
    else if (period && AM.test(period) && h === 12) h = 0;
    else if (!period && h >= 1 && h <= 6) h += 12; // "3시 미팅" 은 보통 오후
    return h * 60 + min;
  }

  const TIME = '(오전|오후|아침|점심|저녁|밤|새벽)?\\s*(?:(\\d{1,2})\\s*:\\s*(\\d{2})|(\\d{1,2})\\s*시\\s*(?:(\\d{1,2})\\s*분|(반))?)';

  function parseDate(c, now) {
    const today = dayOnly(now);
    let m;
    if ((m = c.find(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/g))) {
      c.take(m);
      return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    if ((m = c.find(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g))) {
      c.take(m);
      let d = new Date(today.getFullYear(), +m[1] - 1, +m[2]);
      if (d < addDays(today, -60)) d = new Date(today.getFullYear() + 1, +m[1] - 1, +m[2]);
      return d;
    }
    if ((m = c.find(/(?<![\d:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d])/g))) {
      c.take(m);
      let d = new Date(today.getFullYear(), +m[1] - 1, +m[2]);
      if (d < addDays(today, -60)) d = new Date(today.getFullYear() + 1, +m[1] - 1, +m[2]);
      return d;
    }
    if ((m = c.find(/(\d{1,2})\s*(일|주)\s*(?:후|뒤)/g))) {
      c.take(m);
      return addDays(today, +m[1] * (m[2] === '주' ? 7 : 1));
    }
    if ((m = c.find(/(내일\s*모레|오늘|내일|낼|모레|글피)/g))) {
      c.take(m);
      const w = m[1].replace(/\s/g, '');
      return addDays(today, { 오늘: 0, 내일: 1, 낼: 1, 모레: 2, 내일모레: 2, 글피: 3 }[w]);
    }
    if ((m = c.find(/(다다음\s*주|다음\s*주|담주|이번\s*주|금주)?\s*(?:([월화수목금토일])\s*요일|(주말))/g))) {
      c.take(m);
      const prefix = (m[1] || '').replace(/\s/g, '');
      const target = m[3] ? 6 : DOW.indexOf(m[2]);
      if (!prefix) {
        // 가장 가까운 그 요일 (오늘 포함)
        return addDays(today, (target - today.getDay() + 7) % 7);
      }
      // 주는 월요일부터 시작한다고 본다
      const monday = addDays(today, -((today.getDay() + 6) % 7));
      const offset = (target + 6) % 7;
      const weeks = { 이번주: 0, 금주: 0, 다음주: 1, 담주: 1, 다다음주: 2 }[prefix] || 0;
      return addDays(monday, weeks * 7 + offset);
    }
    if ((m = c.find(/다음\s*달\s*(\d{1,2})\s*일/g))) {
      c.take(m);
      return new Date(today.getFullYear(), today.getMonth() + 1, +m[1]);
    }
    if ((m = c.find(/(?<![\d.])(\d{1,2})\s*일(?!\s*(?:간|동안|반|치|째|후|뒤))/g))) {
      c.take(m);
      let d = new Date(today.getFullYear(), today.getMonth(), +m[1]);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, +m[1]);
      return d;
    }
    return null;
  }

  function readTime(m, offset, inheritPeriod) {
    // m[offset..] = period, hh, mm (콜론형), h, min, 반
    const period = m[offset] || inheritPeriod || '';
    if (m[offset] === '점심' && !m[offset + 1] && !m[offset + 3]) return { min: 12 * 60, period: '오후' };
    const h = +(m[offset + 1] ?? m[offset + 3]);
    const mm = m[offset + 1] != null ? +m[offset + 2] : m[offset + 5] ? 30 : +(m[offset + 4] || 0);
    if (h > 24 || mm > 59) return null;
    const p = period === '점심' ? '오후' : period;
    return { min: to24(h, mm, p), period: m[offset] || '' };
  }

  function parseTime(c) {
    let m;
    if ((m = c.find(/(하루\s*종일|종일|올데이)/g))) {
      c.take(m);
      return { allDay: true };
    }
    // 범위: "2시~4시", "오후 2시부터 4시까지", "14:00-15:30"
    const range = new RegExp(`${TIME}\\s*(?:부터|~|-|–|에서)\\s*${TIME}\\s*(?:까지)?`, 'g');
    if ((m = c.find(range))) {
      const a = readTime(m, 1);
      const b = a && readTime(m, 7, m[1]);
      if (a && b) {
        c.take(m);
        let end = b.min;
        if (end <= a.min && end < 12 * 60) end += 12 * 60;
        return { start: a.min, end };
      }
    }
    if ((m = c.find(/정오/g))) {
      c.take(m);
      return { start: 12 * 60 };
    }
    if ((m = c.find(new RegExp(TIME, 'g'))) && (m[2] || m[4] || m[1] === '점심')) {
      const a = readTime(m, 1);
      if (a) {
        c.take(m);
        let end = null;
        // 이어지는 "2시간", "1시간 30분 동안", "30분 동안"
        const d = c.find(/(\d+(?:\.\d+)?)\s*시간(?:\s*(\d{1,2})\s*분)?(?:\s*동안)?|(\d{1,3})\s*분\s*(?:동안|간)/g);
        if (d) {
          c.take(d);
          end = a.min + (d[3] ? +d[3] : Math.round(+d[1] * 60 + +(d[2] || 0)));
        }
        return { start: a.min, end };
      }
    }
    return {};
  }

  const hhmm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

  function cleanTitle(s) {
    return s
      .replace(/\s+/g, ' ')
      .replace(/^[\s,·~\-–:]+|[\s,·~\-–:]+$/g, '')
      .replace(/^(?:에|에는|부터|까지)\s+/, '')
      .replace(/\s+(?:에|까지|부터)$/, '')
      .replace(/(?:^|\s)(?:에|까지)(?=\s)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {string} text
   * @param {{ base?: Date, now?: Date, defaultMinutes?: number }} opt
   *   base: 날짜가 없을 때 쓸 날짜 (달력에서 선택한 날), now: 기준 시각
   */
  function parse(text, opt = {}) {
    const now = opt.now || new Date();
    const base = dayOnly(opt.base || now);
    const c = makeCursor(String(text || ''));

    let location = '';
    const at = c.find(/@\s*([^\s@]+(?:\s+[^\s@]+)?)/g);
    if (at) { c.take(at); location = at[1].trim(); }

    const date = parseDate(c, now);
    const t = parseTime(c);
    const day = date || base;
    const out = {
      title: cleanTitle(c.rest()),
      location,
      hasDate: !!date,
      hasTime: t.start != null,
      allDay: t.allDay || t.start == null,
      startDay: ymd(day),
      endDay: ymd(day),
      startTime: null,
      endTime: null,
    };
    if (!out.allDay) {
      const end = t.end ?? t.start + (opt.defaultMinutes || 60);
      out.startTime = hhmm(t.start);
      out.endTime = hhmm(Math.min(end, 24 * 60 - 1));
      if (end >= 24 * 60) out.endTime = '23:59';
    }
    return out;
  }

  // "9월 30일 (수) 오후 3:00–4:00"
  function describe(r, now = new Date()) {
    const [y, m, d] = r.startDay.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = dayOnly(now);
    const diff = Math.round((date - today) / 864e5);
    const rel = { 0: '오늘', 1: '내일', 2: '모레' }[diff];
    let s = `${m}월 ${d}일 (${DOW[date.getDay()]})${rel ? ` · ${rel}` : ''}`;
    if (y !== today.getFullYear()) s = `${y}년 ${s}`;
    if (r.allDay) return `${s} 종일`;
    const fmt = (t) => {
      const [h, mi] = t.split(':').map(Number);
      return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(mi)}`;
    };
    const a = fmt(r.startTime), b = fmt(r.endTime);
    const bShort = a.slice(0, 2) === b.slice(0, 2) ? b.slice(3) : b;
    return `${s} ${a}–${bShort}`;
  }

  return { parse, describe, ymd };
});

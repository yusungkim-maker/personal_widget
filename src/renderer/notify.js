// Windows 알림: 일정 N분 전, 매일 정한 시각에 오늘 마감·지난 할 일
// 한 번 보낸 알림은 localStorage 에 기록해 두어 위젯을 다시 켜도 중복되지 않게 한다.

const NOTIFIED_KEY = 'yusk.notified';

function notifiedSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    // 이틀 지난 기록은 버린다
    const cutoff = Date.now() - 2 * 864e5;
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => t > cutoff));
  } catch {
    return {};
  }
}

function markNotified(key) {
  const set = notifiedSet();
  set[key] = Date.now();
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(set)); } catch { /* 저장 못 해도 알림은 동작 */ }
}

function showNotification(title, body, tag) {
  try {
    const n = new Notification(title, { body, tag, silent: false });
    n.onclick = () => widget.showWidget();
  } catch { /* 알림을 쓸 수 없는 환경 */ }
}

const notifyCfg = () => ({ events: true, eventMinutes: 10, todos: true, todoTime: '09:00', ...(config.notify || {}) });

function checkNotifications() {
  if (!config) return;
  const n = notifyCfg();
  const now = Date.now();
  const sent = notifiedSet();

  if (n.events) {
    const today = ymd(new Date());
    const tomorrow = ymd(new Date(now + 864e5));
    for (const e of allEvents()) {
      if (e.allDay || e.holiday || e.pending || e.failed) continue;
      if (e.startDay !== today && e.startDay !== tomorrow) continue;
      const start = new Date(e.start).getTime();
      const left = start - now;
      const key = `ev:${e.gid || e.id}:${e.start}`;
      if (left > 0 && left <= n.eventMinutes * 60e3 && !sent[key]) {
        const mins = Math.max(1, Math.round(left / 60e3));
        showNotification(`${mins}분 후 · ${e.title}`, `${fmtEventTime(e, e.startDay)}${e.location ? ` · ${e.location}` : ''}`, key);
        markNotified(key);
      }
    }
  }

  if (n.todos) {
    const d = new Date();
    const [h, m] = n.todoTime.split(':').map(Number);
    const key = `todo:${ymd(d)}`;
    if (d.getHours() * 60 + d.getMinutes() >= h * 60 + m && !sent[key]) {
      const due = dueTodos();
      if (due.today.length || due.overdue.length) {
        const parts = [];
        if (due.today.length) parts.push(`오늘 마감 ${due.today.length}개`);
        if (due.overdue.length) parts.push(`지난 할 일 ${due.overdue.length}개`);
        const list = [...due.overdue, ...due.today].slice(0, 4).map((t) => `· ${t.text}`).join('\n');
        showNotification(`할 일 · ${parts.join(', ')}`, list, key);
      }
      markNotified(key);
    }
  }
}

// ── 설정 ──

function fillNotifySettings() {
  const n = notifyCfg();
  $('#set-notify-events').checked = n.events;
  $('#set-notify-minutes').value = String(n.eventMinutes);
  $('#set-notify-todos').checked = n.todos;
  $('#set-notify-time').value = n.todoTime;
}

function saveNotify(patch) {
  config.notify = { ...notifyCfg(), ...patch };
  widget.updateConfig({ notify: config.notify });
}

$('#set-notify-events').addEventListener('change', (e) => saveNotify({ events: e.target.checked }));
$('#set-notify-minutes').addEventListener('change', (e) => saveNotify({ eventMinutes: Number(e.target.value) }));
$('#set-notify-todos').addEventListener('change', (e) => saveNotify({ todos: e.target.checked }));
$('#set-notify-time').addEventListener('change', (e) => { if (e.target.value) saveNotify({ todoTime: e.target.value }); });
$('#notify-test').addEventListener('click', () => showNotification(`${aiName()}의 알림 테스트`, '알림이 이렇게 보여요. 눌러 보면 위젯이 앞으로 나와요.', 'test'));

setInterval(checkNotifications, 30e3);
setTimeout(checkNotifications, 8e3);

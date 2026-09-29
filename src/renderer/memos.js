// 위젯의 메모 목록. 편집은 메모마다 뜨는 작은 팝업 창에서 한다.
const MEMO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/></svg>';

function memoWhen(t) {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '어제';
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function renderMemos() {
  const list = [...(config.memos || [])].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#memo-count').textContent = list.length || '';
  $('#memo-list').innerHTML = list.length
    ? list.map((m) => {
      // 제목이 없으면 본문 첫 줄을 제목처럼 보여 준다
      const lines = String(m.body || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const title = m.title || lines.shift() || '제목 없는 메모';
      const preview = lines.join(' ').slice(0, 80);
      return `<li class="memo-item" data-id="${esc(m.id)}" title="눌러서 열기">
        <button class="memo-ico c-${esc(m.color || 'yellow')}" aria-label="메모 열기">${MEMO_ICON}</button>
        <div class="memo-txt"><div class="memo-title">${esc(title)}</div>${preview ? `<div class="memo-prev">${esc(preview)}</div>` : ''}</div>
        <span class="memo-time">${memoWhen(m.updatedAt)}</span>
      </li>`;
    }).join('')
    : '<li class="memo-empty">메모가 없어요. <b>+</b> 를 눌러 첫 메모를 남겨 보세요.</li>';
}

$('#memo-add').addEventListener('click', () => widget.memo.create({}, true));
$('#memo-list').addEventListener('click', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id) widget.memo.open(id);
});

widget.memo.onChanged((list) => {
  config.memos = list;
  renderMemos();
});

renderMemos();

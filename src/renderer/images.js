// 뭉치 답변 속 이미지: 그림 자리(.img-card)가 생기면 실제 이미지 주소를 찾아 보여 준다.
// 같은 주소는 한 번만 찾는다 (답변이 흘러나오는 동안 여러 번 다시 그려져도).
const imageCache = new Map();
const findImage = (url) => {
  if (!imageCache.has(url)) imageCache.set(url, widget.resolveImage(url).catch(() => ({ ok: false, error: '이미지를 찾지 못했어요.' })));
  return imageCache.get(url);
};

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function fillImageCard(card) {
  if (card.dataset.state) return;
  card.dataset.state = 'loading';
  const url = card.dataset.src;
  const alt = card.dataset.alt || '';
  const r = await findImage(url);
  if (!card.isConnected) return;
  const page = r.page || url;
  if (!r.ok) {
    card.dataset.state = 'error';
    card.innerHTML = `<span class="img-err">${esc(r.error)} · <a href="${esc(page)}" target="_blank">${esc(hostOf(page) || '원문')}</a></span>`;
    return;
  }
  card.dataset.state = 'ok';
  card.innerHTML = `<a class="img-link" href="${esc(page)}" target="_blank" title="${esc(alt || hostOf(page))} · 누르면 원문 열기"><img src="${esc(r.src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"></a>${alt ? `<span class="img-cap">${esc(alt)}</span>` : ''}`;
  const img = card.querySelector('img');
  // 이미지가 늦게 뜨면서 대화가 밀리지 않게, 맨 아래를 보고 있었으면 맨 아래로 다시 맞춘다
  const log = $('#ai-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  img.addEventListener('load', () => { if (atBottom) log.scrollTop = log.scrollHeight; }, { once: true });
  img.addEventListener('error', () => {
    card.dataset.state = 'error';
    card.innerHTML = `<span class="img-err">이미지를 불러오지 못했어요 · <a href="${esc(page)}" target="_blank">${esc(hostOf(page) || '원문')}</a></span>`;
  }, { once: true });
}

function scanImages(root) {
  root.querySelectorAll?.('.img-card:not([data-state])').forEach(fillImageCard);
}

// 대화창에 무엇이 그려지든(답변 중·끝·이전 대화·아침 브리핑) 새 그림 자리를 채운다
new MutationObserver(() => scanImages($('#ai-log'))).observe($('#ai-log'), { childList: true, subtree: true });
scanImages($('#ai-log'));

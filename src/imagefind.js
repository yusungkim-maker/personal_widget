// 뭉치가 답변에 넣은 이미지 주소를 실제로 보여 줄 수 있는 이미지 주소로 바꾼다.
//  - 이미지 파일 주소면 그대로
//  - 웹페이지 주소면 그 페이지의 대표 이미지(og:image / twitter:image / image_src)를 찾아서
// 안전: https 만, 내 PC·사내망(사설 IP) 주소는 열지 않는다, 페이지는 앞부분 1.5MB 까지만 읽는다.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const MAX_HTML = 1.5 * 1024 * 1024;

function isPublicHttps(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  // IPv4 사설·특수 대역
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  // IPv6 루프백·사설
  if (h.includes(':') && (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))) return false;
  return true;
}

// HTML 에서 대표 이미지 주소 뽑기 (속성 순서가 달라도 찾는다)
function pickImage(html, pageUrl) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
  const want = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
  for (const key of want) {
    for (const t of metas) {
      const k = (attr(t, 'property') || attr(t, 'name') || '').toLowerCase();
      if (k === key) { const c = attr(t, 'content'); if (c) return absolute(c, pageUrl); }
    }
  }
  const link = (html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i) || [])[0];
  if (link) { const h = attr(link, 'href'); if (h) return absolute(h, pageUrl); }
  return null;
}

function absolute(u, base) {
  try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return null; }
}

async function readLimited(res) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (size < MAX_HTML) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function resolveImage(url) {
  if (!isPublicHttps(url)) return { ok: false, error: '열 수 없는 주소예요.' };
  if (IMAGE_EXT.test(new URL(url).pathname)) return { ok: true, src: url, page: null };
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MungchiWidget/1.4', Accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
    });
    if (!isPublicHttps(res.url)) return { ok: false, error: '열 수 없는 주소예요.' };
    const type = res.headers.get('content-type') || '';
    if (type.startsWith('image/')) { res.body?.cancel?.(); return { ok: true, src: res.url, page: null }; }
    if (!res.ok || !type.includes('html')) return { ok: false, error: '이미지를 찾지 못했어요.' };
    const src = pickImage(await readLimited(res), res.url);
    if (!src || !isPublicHttps(src)) return { ok: false, error: '이 페이지에는 대표 이미지가 없어요.' };
    return { ok: true, src, page: res.url };
  } catch {
    return { ok: false, error: '페이지를 열지 못했어요.' };
  }
}

module.exports = { resolveImage, _internal: { isPublicHttps, pickImage } };

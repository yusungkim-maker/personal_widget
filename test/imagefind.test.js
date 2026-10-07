const test = require('node:test');
const assert = require('node:assert');
const { _internal: { isPublicHttps, pickImage } } = require('../src/imagefind');

test('https 공개 주소만 연다 (내 PC·사내망·http 는 막는다)', () => {
  assert.ok(isPublicHttps('https://upload.wikimedia.org/a.jpg'));
  for (const bad of ['http://example.com/a.jpg', 'https://localhost/a', 'https://127.0.0.1/a', 'https://192.168.0.10/a', 'https://10.1.2.3/a',
    'https://172.20.0.1/a', 'https://169.254.169.254/latest', 'https://[::1]/a', 'https://intranet/a', 'file:///C:/a.png', 'https://user:pw@example.com/a']) {
    assert.ok(!isPublicHttps(bad), bad);
  }
});

test('페이지의 대표 이미지를 찾는다 (속성 순서·상대 주소)', () => {
  const page = 'https://news.example.com/article/1';
  assert.strictEqual(pickImage('<meta content="https://img.example.com/a.jpg" property="og:image">', page), 'https://img.example.com/a.jpg');
  assert.strictEqual(pickImage('<meta name="twitter:image" content="/b.png">', page), 'https://news.example.com/b.png');
  assert.strictEqual(pickImage('<link rel="image_src" href="//cdn.example.com/c.webp">', page), 'https://cdn.example.com/c.webp');
  assert.strictEqual(pickImage('<meta property="og:image" content="https://x.com/a.jpg?w=1&amp;h=2">', page), 'https://x.com/a.jpg?w=1&h=2');
  assert.strictEqual(pickImage('<p>no image</p>', page), null);
});

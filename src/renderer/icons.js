// 날씨 아이콘 (인라인 SVG). key: clear | partly | cloudy | rain | shower | snow | sleet
(function () {
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(a) * (r + 3), y1 = cy + Math.sin(a) * (r + 3);
      const x2 = cx + Math.cos(a) * (r + 6.5), y2 = cy + Math.sin(a) * (r + 6.5);
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    return `<g stroke="#FFC857" stroke-width="2.4" stroke-linecap="round">${rays}</g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-sun)"/>`;
  };
  const cloud = (dx = 0, dy = 0, fill = 'url(#g-cloud)') =>
    `<path transform="translate(${dx} ${dy})" fill="${fill}"
      d="M14 38h24a9 9 0 0 0 1.5-17.9A12 12 0 0 0 16.4 18 10 10 0 0 0 14 38z"/>`;
  const drops = (n = 3) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 17 + i * 8;
      s += `<path d="M${x} 42 l-2.4 5.5" stroke="#5AB0FF" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    return s;
  };
  const flakes = (n = 3) => {
    let s = '';
    for (let i = 0; i < n; i++) s += `<circle cx="${17 + i * 8}" cy="${45 + (i % 2) * 2}" r="2.1" fill="#E8F3FF"/>`;
    return s;
  };

  // 그라디언트는 페이지에 한 번만 정의한다 (숨겨진 SVG 안의 defs 는 참조가 끊길 수 있음)
  const defs = `<defs>
    <radialGradient id="g-sun" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE59A"/><stop offset="1" stop-color="#FFB547"/></radialGradient>
    <linearGradient id="g-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D3E3"/></linearGradient>
    <linearGradient id="g-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B7C2D4"/><stop offset="1" stop-color="#8793A8"/></linearGradient>
  </defs>`;

  const BODY = {
    clear: sun(26, 26, 10),
    partly: `<g transform="translate(6 -4) scale(.8)">${sun(26, 22, 9)}</g>${cloud(0, 6)}`,
    cloudy: `${cloud(6, -2, 'url(#g-dark)')}${cloud(-2, 6)}`,
    rain: `${cloud(0, -2, 'url(#g-dark)')}${drops(3)}`,
    shower: `<g transform="translate(8 -6) scale(.75)">${sun(26, 22, 9)}</g>${cloud(0, -2)}${drops(2)}`,
    snow: `${cloud(0, -2)}${flakes(3)}`,
    sleet: `${cloud(0, -2, 'url(#g-dark)')}<path d="M17 42 l-2.4 5.5" stroke="#5AB0FF" stroke-width="2.6" stroke-linecap="round"/><circle cx="26" cy="46" r="2.1" fill="#E8F3FF"/><path d="M33 42 l-2.4 5.5" stroke="#5AB0FF" stroke-width="2.6" stroke-linecap="round"/>`,
  };

  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.style.position = 'absolute';
  holder.innerHTML = defs;
  document.documentElement.appendChild(holder);

  window.weatherIcon = (key, size = 32) =>
    `<svg class="wicon" width="${size}" height="${size}" viewBox="0 0 52 52" aria-hidden="true">${BODY[key] || BODY.partly}</svg>`;
})();

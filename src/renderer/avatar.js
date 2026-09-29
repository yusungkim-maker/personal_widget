// AI 비서 프로필: 뭉치 (사용자의 고양이 사진을 바탕으로 직접 그린 SVG 캐릭터)
// 특징: 푸른빛 회색 털, 크고 쫑긋한 새끼 고양이 귀, 동그란 까만 눈, 노란 목걸이 + 노란 체크 반다나, 냐앙 하는 입
(function () {
  const defs = `<defs>
      <radialGradient id="mc-bg" cx="50%" cy="30%" r="80%">
        <stop offset="0" stop-color="#FFF7DE"/><stop offset="1" stop-color="#F2DFA6"/>
      </radialGradient>
      <radialGradient id="mc-fur" cx="50%" cy="35%" r="70%">
        <stop offset="0" stop-color="#9BA3B0"/><stop offset="0.65" stop-color="#838C9A"/><stop offset="1" stop-color="#6B7381"/>
      </radialGradient>
      <pattern id="mc-check" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="#F5C933"/>
        <rect width="1.5" height="1.5" fill="#FFF3C4"/>
        <rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#E9B41E"/>
      </pattern>
      <clipPath id="mc-clip"><circle cx="32" cy="32" r="32"/></clipPath>
    </defs>`;

  // 그라디언트는 페이지에 한 번만 등록한다 (아바타가 여러 개 떠도 참조가 끊기지 않게)
  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.style.position = 'absolute';
  holder.innerHTML = defs;
  document.documentElement.appendChild(holder);

  const svg = `
    <g clip-path="url(#mc-clip)">
      <circle cx="32" cy="32" r="32" fill="url(#mc-bg)"/>
      <!-- 몸 -->
      <ellipse cx="32" cy="68" rx="21" ry="15" fill="#7E8795"/>
      <!-- 크고 쫑긋한 귀 -->
      <path d="M10.5 32 Q8 10 13 5.5 Q16.5 3.5 29 18 Z" fill="#7A8392"/>
      <path d="M53.5 32 Q56 10 51 5.5 Q47.5 3.5 35 18 Z" fill="#7A8392"/>
      <path d="M13.5 26 Q12.5 12 15.3 9.5 Q17.5 8.8 25 17.5 Z" fill="#5F5760" opacity="0.85"/>
      <path d="M50.5 26 Q51.5 12 48.7 9.5 Q46.5 8.8 39 17.5 Z" fill="#5F5760" opacity="0.85"/>
      <!-- 얼굴 -->
      <ellipse cx="32" cy="36" rx="22.5" ry="19" fill="url(#mc-fur)"/>
      <path d="M29.5 20 Q30.3 23.5 29.8 26 M32 19.4 Q32 23.5 32 26.6 M34.5 20 Q33.7 23.5 34.2 26" stroke="#737C8A" stroke-width="0.9" stroke-linecap="round" fill="none" opacity="0.25"/>
      <!-- 동그란 까만 눈 -->
      <circle cx="23.5" cy="35" r="5.3" fill="#1D1A1C"/>
      <circle cx="40.5" cy="35" r="5.3" fill="#1D1A1C"/>
      <circle cx="25.4" cy="32.9" r="1.9" fill="#fff"/>
      <circle cx="42.4" cy="32.9" r="1.9" fill="#fff"/>
      <circle cx="22" cy="37.2" r="0.8" fill="#fff" opacity="0.8"/>
      <circle cx="39" cy="37.2" r="0.8" fill="#fff" opacity="0.8"/>
      <!-- 주둥이, 코, 냐앙 하는 입 -->
      <ellipse cx="28.8" cy="44" rx="4.4" ry="3.4" fill="#A3ABB7"/>
      <ellipse cx="35.2" cy="44" rx="4.4" ry="3.4" fill="#A3ABB7"/>
      <path d="M30 40.4 Q32 39.6 34 40.4 Q33.3 42.4 32 42.8 Q30.7 42.4 30 40.4 Z" fill="#5E5157"/>
      <path d="M29.6 45.2 Q32 43.4 34.4 45.2 Q33.9 49.2 32 49.4 Q30.1 49.2 29.6 45.2 Z" fill="#C86F80"/>
      <path d="M30.6 47.6 Q32 46.6 33.4 47.6 Q32.9 49 32 49.1 Q31.1 49 30.6 47.6 Z" fill="#E59AA6"/>
      <!-- 수염 -->
      <g stroke="#F4F1E8" stroke-width="0.8" stroke-linecap="round" opacity="0.85">
        <path d="M24 44 L11 42.5"/><path d="M24 45.8 L11.5 47"/>
        <path d="M40 44 L53 42.5"/><path d="M40 45.8 L52.5 47"/>
      </g>
      <!-- 노란 목걸이와 체크 반다나 -->
      <path d="M14.5 53.5 Q32 61 49.5 53.5" stroke="#F2C230" stroke-width="3.6" stroke-linecap="round" fill="none"/>
      <path d="M25.5 56.6 L38.5 56.6 L32.5 64.5 Z" fill="url(#mc-check)" stroke="#E0A915" stroke-width="0.6" stroke-linejoin="round"/>
      <circle cx="32" cy="57.4" r="1.4" fill="#E0A915"/>
    </g>`;

  window.catAvatar = (size = 28) =>
    `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${svg}</svg>`;
})();

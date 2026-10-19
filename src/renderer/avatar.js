// AI 비서 프로필 사진: 기본은 회색 브리티시 쇼트헤어 고양이(assets/mungchi-cat.svg),
// 사용자가 고른 사진은 정사각형 160px 로 잘라 설정(ai.avatar, data URL)에 저장한다.
(function () {
  const DEFAULT = '../assets/mungchi-cat.svg';
  // 위젯(app.js)은 전역 config, 빠른 입력·온보딩 창은 window.aiAvatarSrc 로 넘겨준다
  const current = () => {
    try { if (typeof config !== 'undefined' && config?.ai?.avatar) return config.ai.avatar; } catch { /* 없음 */ }
    return window.aiAvatarSrc || DEFAULT;
  };
  window.avatarSrc = current;
  window.catAvatar = (size = 28) =>
    `<img class="avatar" src="${current()}" width="${size}" height="${size}" alt="" aria-hidden="true" style="border-radius:50%;object-fit:cover;flex:none">`;

  // 이미 그려진 프로필 사진들을 지금 사진으로 바꾼다 (대화 기록 속 작은 사진까지)
  window.refreshAvatars = () => {
    const src = current();
    document.querySelectorAll('img.avatar').forEach((i) => { if (i.getAttribute('src') !== src) i.src = src; });
  };

  // 사진 고르기: 파일 창 → 가운데를 정사각형으로 잘라 160×160 → data URL (취소하면 null)
  window.pickAvatarImage = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 15 * 1024 * 1024) return resolve({ error: '15MB 보다 작은 사진을 골라 주세요.' });
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const S = 160, side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
        URL.revokeObjectURL(url);
        // 사진은 JPEG 가 훨씬 작다. 투명 배경 PNG 라도 원형으로 잘라 보이므로 문제없다.
        resolve({ src: c.toDataURL('image/jpeg', 0.9) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: '이 사진은 열 수 없어요. PNG·JPG 사진을 골라 주세요.' }); };
      img.src = url;
    };
    input.click();
  });
})();

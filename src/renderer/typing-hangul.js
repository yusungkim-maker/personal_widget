// 한글 조합 중인 글자 판정: 지금까지 누른 자모가 목표 글자를 향해 가고 있는지 (두벌식 키 순서로 비교)
// 예) 목표 '간' ← 'ㄱ' '가' '간' 모두 맞는 길. 목표 '가나' 의 첫 글자 자리에서 '간' 도 맞는 길 (ㅏ 를 치면 '가나' 가 된다)
(function (root) {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  // 겹모음·겹받침은 두 번 누른다
  const SPLIT = { 'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ',
    'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };

  // 한 글자 → 누르는 자모 순서
  function keys(ch) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) {
      const jung = JUNG[Math.floor((c % 588) / 28)], jong = JONG[c % 28];
      return CHO[Math.floor(c / 588)] + (SPLIT[jung] || jung) + (SPLIT[jong] || jong);
    }
    return SPLIT[ch] || ch;
  }
  const keySeq = (s) => [...s].map(keys).join('');
  const isHangul = (ch) => /[ㄱ-ㅣ가-힣]/.test(ch || '');

  // 조합 중인 글자 typed 가 목표(rest = 이 자리부터 남은 목표 글자들)로 가는 중인가
  function composingOk(typed, rest) {
    if (!typed || !rest) return false;
    if (!isHangul(typed)) return rest.startsWith(typed);
    return keySeq(rest.slice(0, 2)).startsWith(keys(typed));
  }

  const api = { keys, keySeq, composingOk, isHangul };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TypingHangul = api;
})(typeof window !== 'undefined' ? window : globalThis);

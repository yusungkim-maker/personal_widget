// 큰 타자 연습 창: 엔진을 창 전체에 띄운다
const typingTest = createTypingTest(document.getElementById('mt'), { onClose: () => widget.closeSelf() });
document.getElementById('close').addEventListener('click', () => widget.closeSelf());
// 창 어디를 눌러도(설정 줄·버튼 제외) 입력으로
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); widget.closeSelf(); }
  else if (document.activeElement === document.body && e.key.length === 1) typingTest.focus();
});

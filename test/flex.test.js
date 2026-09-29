const test = require('node:test');
const assert = require('node:assert');
const { parseWorkText } = require('../src/flex')._internal;

test('flex 화면 글자에서 근무 상태·시간 읽기', () => {
  assert.deepStrictEqual(parseWorkText('에임드\n근무 중 7시간 15분\n홈'), { status: '근무 중', minutes: 435 });
  assert.deepStrictEqual(parseWorkText('근무중 45분'), { status: '근무중', minutes: 45 });
  assert.deepStrictEqual(parseWorkText('휴게 중 1시간'), { status: '휴게 중', minutes: 60 });
  assert.deepStrictEqual(parseWorkText('퇴근 완료 18:03'), { status: '퇴근', minutes: null });
  assert.deepStrictEqual(parseWorkText('근무 전 · 출근하기'), { status: '근무 전', minutes: null });
  assert.strictEqual(parseWorkText('아무 관계 없는 글'), null);
});

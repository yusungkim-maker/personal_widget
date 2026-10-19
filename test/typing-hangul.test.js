const test = require('node:test');
const assert = require('node:assert');
const { keys, composingOk } = require('../src/renderer/typing-hangul');

test('글자를 두벌식 키 순서로 푼다', () => {
  assert.strictEqual(keys('간'), 'ㄱㅏㄴ');
  assert.strictEqual(keys('과'), 'ㄱㅗㅏ');
  assert.strictEqual(keys('닭'), 'ㄷㅏㄹㄱ');
  assert.strictEqual(keys('ㄱ'), 'ㄱ');
});

test('조합 중인 글자가 목표로 가는 중이면 맞음', () => {
  for (const t of ['ㄱ', '가', '간']) assert.ok(composingOk(t, '간'), t);
  assert.ok(composingOk('간', '가나')); // ㅏ 를 치면 '가나' 가 된다
  assert.ok(composingOk('갉', '갈가'));
  assert.ok(composingOk('고', '과'));
  assert.ok(composingOk('ㅅ', '사람'));
  assert.ok(composingOk('살', '사람'));
});

test('목표에서 벗어나면 틀림', () => {
  assert.ok(!composingOk('ㄴ', '간'));
  assert.ok(!composingOk('거', '간'));
  assert.ok(!composingOk('갈', '간'));
  assert.ok(!composingOk('ㄲ', '간'));
  assert.ok(!composingOk('가', ''));
  assert.ok(!composingOk('삼', '사람'));
});

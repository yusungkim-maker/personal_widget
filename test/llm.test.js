// node --test test/  —  codex-chatgpt-login-integration.md 체크리스트 중 자동 확인 가능한 항목
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

// 부모 환경에 비밀값이 있다고 가정
Object.assign(process.env, {
  OPENAI_API_KEY: 'sk-test', CODEX_API_KEY: 'x', CODEX_ACCESS_TOKEN: 'x', OPENAI_BASE_URL: 'http://evil',
  ANTHROPIC_API_KEY: 'sk-ant-test', FOO_SECRET: 'leak', KMA_SERVICE_KEY: 'kma',
});
const llm = require('../src/llm');
const { parseCodexStatus, parseClaudeStatus, execEnv, loginEnv, codexArgs, claudeArgs, codexRuntime, CODEX_HOME } = llm._internal;

const SECRETS = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY', 'KMA_SERVICE_KEY'];

test('API 키류는 login·status·exec 자식 env 어디에도 없다', () => {
  for (const env of [loginEnv('codex'), loginEnv('claude'), execEnv('codex'), execEnv('claude')]) {
    for (const k of SECRETS) assert.strictEqual(env[k], undefined, k);
  }
});

test('exec env 는 allowlist 만 담는다 (임의의 비밀값 없음)', () => {
  assert.strictEqual(execEnv('codex').FOO_SECRET, undefined);
  assert.strictEqual(execEnv('claude').FOO_SECRET, undefined);
  assert.ok(execEnv('codex').PATH || execEnv('codex').Path);
});

test('Codex 자식 env 의 CODEX_HOME 은 위젯 전용 경로다', () => {
  assert.strictEqual(execEnv('codex').CODEX_HOME, CODEX_HOME);
  assert.strictEqual(loginEnv('codex').CODEX_HOME, CODEX_HOME);
  assert.notStrictEqual(CODEX_HOME, path.join(os.homedir(), '.codex'));
});

test('codex login status 파서 (fail closed)', () => {
  assert.strictEqual(parseCodexStatus({ code: 0, out: 'Logged in using ChatGPT\n' }), 'ok');
  assert.strictEqual(parseCodexStatus({ code: 0, out: 'Logged in using an API key - sk-***' }), 'api-key');
  assert.strictEqual(parseCodexStatus({ code: 1, out: 'Not logged in' }), 'none');
  assert.strictEqual(parseCodexStatus({ code: 0, out: 'something new' }), 'unknown');
  assert.strictEqual(parseCodexStatus({ code: 1, out: 'Logged in using ChatGPT' }), 'unknown');
  assert.strictEqual(parseCodexStatus(null), 'unknown');
});

test('claude auth status 파서: claude.ai 구독 로그인만 통과', () => {
  assert.strictEqual(parseClaudeStatus({ out: '{"loggedIn":true,"authMethod":"claude.ai","email":"a@b"}' }).mode, 'ok');
  assert.strictEqual(parseClaudeStatus({ out: '{"loggedIn":true,"authMethod":"api-key"}' }).mode, 'api-key');
  assert.strictEqual(parseClaudeStatus({ out: '{"loggedIn":false}' }).mode, 'none');
  assert.strictEqual(parseClaudeStatus({ out: 'garbage' }).mode, 'unknown');
});

test('codex exec 필수 플래그가 모두 있고, 작업 폴더는 temp 내부, 프롬프트는 stdin(-)', () => {
  const dir = path.join(os.tmpdir(), 'yusk-ai-x');
  const a = codexArgs('gpt-5.5', 'low', false, dir);
  for (const f of ['--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check']) assert.ok(a.includes(f), f);
  assert.deepStrictEqual(a.slice(a.indexOf('--sandbox'), a.indexOf('--sandbox') + 2), ['--sandbox', 'read-only']);
  assert.deepStrictEqual(a.slice(a.indexOf('--color'), a.indexOf('--color') + 2), ['--color', 'never']);
  assert.strictEqual(a[a.indexOf('--cd') + 1], dir);
  assert.ok(a.includes('approval_policy="never"'));
  assert.strictEqual(a.at(-1), '-');
});

test('성격·지침은 시스템 프롬프트에 들어가고, 비어 있으면 전문 비서 프리셋을 쓴다', () => {
  const { systemText } = llm._internal;
  assert.ok(systemText({}).includes(llm.PRESETS.pro));
  assert.ok(systemText({ name: '뭉치' }).includes('[당신의 이름] 뭉치'));
  // 고양이 말투는 성격을 바꾸지 않고 덧붙기만 한다
  const cat = systemText({ personaPreset: 'pro', catTone: true });
  assert.ok(cat.includes(llm.PRESETS.pro) && cat.includes('[말투]'));
  assert.ok(!systemText({ catTone: false }).includes('[말투]'));
  assert.ok(systemText({}).includes('mungchi-action'), '일정 등록 제안 형식을 안내한다');
  assert.ok(systemText({}).includes('"type":"memo"'), '메모 제안 형식을 안내한다');
  const s = systemText({ personaPreset: 'concise', about: '홍길동, 마케팅팀', rules: '항상 표로 정리' });
  assert.ok(s.includes(llm.PRESETS.concise) && s.includes('홍길동, 마케팅팀') && s.includes('항상 표로 정리'));
  assert.ok(systemText({ persona: '직접 쓴 성격' }).includes('직접 쓴 성격'));
  assert.ok(systemText({ about: 'x'.repeat(5000) }).length < 5000);
});

test('claude 는 도구를 끄거나 웹 검색만 허용하고, 프롬프트를 인자로 넘기지 않는다', () => {
  const off = claudeArgs('sonnet', 'low', false, 'C:/tmp/system.txt');
  assert.ok(!off.includes('--system-prompt'), '시스템 프롬프트는 파일로만');
  assert.strictEqual(off[off.indexOf('--system-prompt-file') + 1], 'C:/tmp/system.txt');
  assert.strictEqual(off[off.indexOf('--tools') + 1], '');
  const on = claudeArgs('sonnet', 'low', true, 'C:/tmp/system.txt');
  assert.strictEqual(on[on.indexOf('--tools') + 1], 'WebSearch');
  assert.ok(!on.some((x) => x.includes('[이번 질문]')));
});

test('고정 버전 Codex 런타임만 사용한다', () => {
  const rt = codexRuntime();
  assert.ok(rt, '런타임 없음');
  assert.strictEqual(rt.version, '0.158.0');
  assert.ok(rt.prefix[0].includes(path.join('node_modules', '@openai', 'codex')));
});

test('대화 기억: 저장된 대화를 불러오고, 프롬프트에는 최근 12시간만 넣는다', () => {
  let saved = null;
  llm.setPersistence({
    load: () => [
      { role: 'user', text: '어제 질문', at: Date.now() - 20 * 3600e3 },
      { role: 'assistant', text: '어제 답', at: Date.now() - 20 * 3600e3 },
      { role: 'user', text: '방금 질문', at: Date.now() - 60e3 },
      { role: 'assistant', text: '방금 답', at: Date.now() - 60e3 },
      { bad: true },
    ],
    save: (l) => { saved = l; },
  });
  assert.strictEqual(llm.getHistory().length, 4);
  const prompt = llm._internal.buildPrompt('새 질문', '상황', null);
  assert.ok(prompt.includes('방금 질문') && !prompt.includes('어제 질문'));
  llm.reset();
  assert.deepStrictEqual(saved, []);
});

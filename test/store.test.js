// 설정·키 보존 테스트: 어떤 경우에도 한 번 넣은 키와 설정이 사라지지 않아야 한다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// electron 가짜: userData 는 임시 폴더, safeStorage 는 되돌릴 수 있는 인코딩
function fakeElectron(userData) {
  return {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`),
      decryptString: (b) => { const s = b.toString(); if (!s.startsWith('enc:')) throw new Error('bad'); return s.slice(4); },
    },
  };
}

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yusk-store-'));
  const userData = path.join(root, 'Roaming', 'Yusk Widget');
  fs.mkdirSync(userData, { recursive: true });
  process.env.LOCALAPPDATA = path.join(root, 'Local');
  const electron = fakeElectron(userData);
  const load = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? electron : load.call(this, req, ...rest); };
  const storePath = require.resolve('../src/store');
  delete require.cache[storePath];
  const store = require('../src/store');
  Module._load = load;
  const logs = [];
  store.setLogger((e, d) => logs.push([e, d]));
  return { store, userData, root, logs, reopen: () => { // 앱을 껐다 켠 것처럼 모듈을 새로 읽는다 (저장은 각 테스트가 직접)
    Module._load = function (req, ...rest) { return req === 'electron' ? electron : load.call(this, req, ...rest); };
    delete require.cache[storePath];
    const s2 = require('../src/store');
    Module._load = load;
    s2.setLogger((e, d) => logs.push([e, d]));
    s2.load();
    return s2;
  } };
}

test('키는 빈 값·null 조각으로 덮어써지지 않는다', () => {
  const { store } = freshStore();
  store.load();
  store.setSecret('weather', 'KMA-KEY');
  store.update({ weather: { keyEnc: null, locations: [{ name: '부산', latitude: 35, longitude: 129 }] } });
  store.update({ secrets: {} });
  store.setSecret('weather', '');
  assert.strictEqual(store.getSecret('weather'), 'KMA-KEY');
  assert.strictEqual(store.get().weather.locations[0].name, '부산');
});

test('껐다 켜도 설정과 키가 그대로', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('weather', 'KMA-KEY');
  t.store.update({ calendar: { icalUrls: ['https://x/basic.ics'] }, todos: [{ id: 'a', text: '보고서' }] });
  t.store.flush();
  const s2 = t.reopen();
  assert.strictEqual(s2.getSecret('weather'), 'KMA-KEY');
  assert.deepStrictEqual(s2.get().calendar.icalUrls, ['https://x/basic.ics']);
  assert.strictEqual(s2.get().todos[0].text, '보고서');
});

test('config.json 이 깨지면 직전 정상본(.bak)으로 복구하고 기본값으로 덮지 않는다', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('weather', 'KMA-KEY');
  t.store.update({ todos: [{ id: 'a', text: '보고서' }] });
  t.store.flush();
  t.store.update({ todos: [{ id: 'a', text: '보고서' }, { id: 'b', text: '회의' }] });
  t.store.flush(); // 이제 .bak 에 보고서 1개짜리, 본 파일에 2개짜리
  fs.writeFileSync(path.join(t.userData, 'config.json'), '{ 깨진 파일');
  const s2 = t.reopen();
  assert.strictEqual(s2.getSecret('weather'), 'KMA-KEY');
  assert.ok(s2.get().todos.length >= 1);
  assert.ok(fs.readdirSync(t.userData).some((f) => f.startsWith('config.unreadable-')), '깨진 원본은 남겨 둔다');
});

test('설정 파일이 통째로 사라져도 금고와 백업에서 되살린다', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('weather', 'KMA-KEY');
  t.store.update({ calendar: { icalUrls: ['https://x/basic.ics'] } });
  t.store.flush();
  // 자동 백업 한 개
  fs.mkdirSync(path.join(t.userData, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(t.userData, 'backups', 'backup-2026-09-30_1000.json'), JSON.stringify({ config: t.store.get(), withSecrets: true }));
  for (const f of ['config.json', 'config.json.bak']) fs.rmSync(path.join(t.userData, f), { force: true });
  const s2 = t.reopen();
  assert.strictEqual(s2.getSecret('weather'), 'KMA-KEY');
  assert.deepStrictEqual(s2.get().calendar.icalUrls, ['https://x/basic.ics']);
});

test('Roaming 금고까지 없어도 Local 금고에서 키를 되살린다', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('weather', 'KMA-KEY');
  t.store.flush();
  for (const f of ['config.json', 'config.json.bak', 'vault.json']) fs.rmSync(path.join(t.userData, f), { force: true });
  const s2 = t.reopen();
  assert.strictEqual(s2.getSecret('weather'), 'KMA-KEY');
});

test('키가 비어 있는 백업으로 되돌려도 저장된 키는 지켜진다', () => {
  const { store } = freshStore();
  store.load();
  store.setSecret('weather', 'KMA-KEY');
  store.setSecret('googleToken', '{"refresh_token":"r"}');
  store.replace({ weather: { keyEnc: null }, secrets: {}, todos: [] });
  assert.strictEqual(store.getSecret('weather'), 'KMA-KEY');
  assert.strictEqual(store.getSecret('googleToken'), '{"refresh_token":"r"}');
});

test('기본값만 든 파일이 있어도 사용자 데이터가 있는 백업을 우선한다', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('weather', 'KMA-KEY');
  t.store.update({ todos: [{ id: 'a', text: '보고서' }] });
  fs.mkdirSync(path.join(t.userData, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(t.userData, 'backups', 'backup-2026-09-30_1000.json'), JSON.stringify({ config: t.store.get(), withSecrets: true }));
  t.store.flush();
  // 오늘 오전처럼 기본값 설정 파일로 바뀐 상황
  fs.writeFileSync(path.join(t.userData, 'config.json'), JSON.stringify({ weather: { keyEnc: null }, todos: [] }));
  fs.rmSync(path.join(t.userData, 'config.json.bak'), { force: true });
  const s2 = t.reopen();
  assert.strictEqual(s2.get().todos[0].text, '보고서');
  assert.strictEqual(s2.getSecret('weather'), 'KMA-KEY');
});

test('사용자가 직접 연결을 끊을 때만 지워진다', () => {
  const t = freshStore();
  t.store.load();
  t.store.setSecret('googleToken', '{"refresh_token":"r"}');
  t.store.clearSecret('googleToken', 'user-disconnect');
  assert.strictEqual(t.store.getSecret('googleToken'), null);
  const s2 = t.reopen();
  assert.strictEqual(s2.getSecret('googleToken'), null, '금고에서도 되살아나지 않는다');
});

test('저장 중 임시 파일이 남지 않는다', () => {
  const t = freshStore();
  t.store.load();
  t.store.update({ todos: [{ id: 'a', text: 'x' }] });
  t.store.flush();
  assert.ok(!fs.readdirSync(t.userData).some((f) => f.includes('.tmp-')));
});

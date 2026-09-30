// 진단용 로그: 켜진 방식(자동 실행 여부), 오류, 종료 이유를 %APPDATA%\Yusk Widget\logs\main.log 에 남긴다.
// 개인 데이터(일정·대화·키)는 적지 않는다.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX = 256 * 1024;
const file = () => path.join(app.getPath('userData'), 'logs', 'main.log');

function log(event, detail = {}) {
  try {
    const f = file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f) && fs.statSync(f).size > MAX) fs.renameSync(f, `${f}.1`);
    fs.appendFileSync(f, `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}\n`, 'utf8');
  } catch { /* 로그 실패는 무시 */ }
}

function install() {
  log('start', {
    version: app.getVersion(), packaged: app.isPackaged, pid: process.pid,
    autostart: process.argv.includes('--autostart'), uptimeSec: Math.round(require('os').uptime()),
  });
  process.on('uncaughtException', (e) => log('uncaughtException', { message: e.message, stack: String(e.stack).split('\n').slice(0, 4).join(' | ') }));
  process.on('unhandledRejection', (e) => log('unhandledRejection', { message: String(e?.message || e) }));
  app.on('render-process-gone', (_e, _wc, d) => log('render-process-gone', d));
  app.on('child-process-gone', (_e, d) => log('child-process-gone', { type: d.type, reason: d.reason, exitCode: d.exitCode }));
  app.on('before-quit', () => log('before-quit'));
  app.on('quit', (_e, code) => log('quit', { code }));
}

module.exports = { log, install };

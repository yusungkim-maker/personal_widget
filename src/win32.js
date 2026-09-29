// "바탕화면 고정" 모드에 필요한 Win32 호출 (koffi FFI).
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'bool',
  ['intptr', 'intptr', 'int', 'int', 'int', 'int', 'uint']);
const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'intptr', ['str16', 'str16']);
const SetWindowLongPtrW = user32.func('__stdcall', 'SetWindowLongPtrW', 'intptr',
  ['intptr', 'int', 'intptr']);

const HWND_BOTTOM = 1;
const HWND_NOTOPMOST = -2;
const GWLP_HWNDPARENT = -8;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const FLAGS = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE;

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
}

// 창을 Z-순서 맨 아래로 보낸다 (다른 모든 창 뒤, 바탕화면 아이콘 위).
function sendToBottom(win) {
  SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, FLAGS);
}

// 바탕화면(Progman)을 소유자로 지정하면 "바탕화면 보기(Win+D)"에도 창이 숨지 않는다.
function attachToDesktop(win) {
  const progman = FindWindowW('Progman', null);
  if (progman) SetWindowLongPtrW(hwndOf(win), GWLP_HWNDPARENT, progman);
  sendToBottom(win);
}

function detachFromDesktop(win) {
  SetWindowLongPtrW(hwndOf(win), GWLP_HWNDPARENT, 0);
  SetWindowPos(hwndOf(win), HWND_NOTOPMOST, 0, 0, 0, 0, FLAGS);
}

module.exports = { sendToBottom, attachToDesktop, detachFromDesktop };

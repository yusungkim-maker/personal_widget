// 설정 → 백업
function renderBackup(st) {
  const when = st.last ? new Date(st.last).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '아직 없음';
  $('#backup-state').textContent = `하루 한 번 자동으로 백업해요. 마지막 백업: ${when} · ${st.count}개 보관 (최근 30개)`;
  $('#backup-extra-state').textContent = st.extraDir
    ? `${st.extraDir} 에도 비밀값을 뺀 사본을 저장해요.`
    : 'OneDrive 같은 폴더를 고르면 PC가 바뀌어도 할 일·메모를 되살릴 수 있어요. (키·토큰은 빼고 저장)';
  $('#backup-extra-clear').hidden = !st.extraDir;
}
async function refreshBackup() { renderBackup(await widget.backup.status()); }

$('#backup-now').addEventListener('click', async () => { renderBackup(await widget.backup.now()); toast('백업했어요'); });
$('#backup-open').addEventListener('click', () => widget.backup.open());
$('#backup-restore').addEventListener('click', async () => {
  const r = await widget.backup.restore();
  if (r.error) toast(r.error, null, 'err');
});
$('#backup-extra').addEventListener('click', async () => renderBackup(await widget.backup.chooseExtra()));
$('#backup-extra-clear').addEventListener('click', async () => renderBackup(await widget.backup.clearExtra()));

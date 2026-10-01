// 현재 위치: Windows 위치 서비스(GeoCoordinateWatcher)로 위경도를 받고, Nominatim 으로 지역 이름을 붙인다.
// IP 위치 조회 같은 외부 서비스에는 보내지 않는다. Windows 설정에서 위치가 꺼져 있으면 알려 준다.
const { execFile } = require('child_process');

const PS = `
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher('Default')
$ok = $w.TryStart($false, [TimeSpan]::FromSeconds(8))
$t = 0
while ($t -lt 80 -and ($w.Position.Location.IsUnknown)) { Start-Sleep -Milliseconds 100; $t++ }
$l = $w.Position.Location
if ($w.Permission -eq 'Denied') { 'DENIED' } elseif ($l.IsUnknown) { 'UNKNOWN:' + $w.Status } else { '{0},{1}' -f $l.Latitude.ToString([Globalization.CultureInfo]::InvariantCulture), $l.Longitude.ToString([Globalization.CultureInfo]::InvariantCulture) }
$w.Stop()
`;

function windowsPosition() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { windowsHide: true, timeout: 20000 }, (err, out) => {
      const s = String(out || '').trim().split(/\r?\n/).pop();
      if (s === 'DENIED') return reject(new Error('Windows 설정 → 개인 정보 → 위치에서 위치 서비스를 켜 주세요.'));
      const m = s.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (m) return resolve({ latitude: Number(m[1]), longitude: Number(m[2]) });
      reject(new Error(err ? '위치를 확인하지 못했어요.' : 'Windows가 아직 위치를 모르는 것 같아요. 위치 서비스가 켜져 있는지 확인하거나 검색으로 추가해 주세요.'));
    });
  });
}

async function placeName({ latitude, longitude }) {
  const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: 'jsonv2', 'accept-language': 'ko', zoom: '14' })}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'MungchiWidget/1.0 (desktop widget)' }, signal: AbortSignal.timeout(10000) });
    const a = (await r.json()).address || {};
    const city = a.city || a.county || a.town || a.province || a.state || '';
    const sub = a.borough || a.city_district || a.suburb || a.quarter || '';
    return { name: (sub || city || '현재 위치').replace(/\s+/g, ' '), region: [a.state || a.province, city].filter(Boolean).join(' ') };
  } catch {
    return { name: '현재 위치', region: '' };
  }
}

async function locate() {
  const pos = await windowsPosition();
  return { ...pos, ...(await placeName(pos)) };
}

module.exports = { locate };

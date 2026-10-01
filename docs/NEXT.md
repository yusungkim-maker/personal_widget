# 진행 상황

## 1.4.0 (2026-10-01) — 배포 준비 완료
- 이름: 뭉치위젯 (실행 파일 MungchiWidget.exe, 시작 메뉴·바탕화면·시작프로그램 바로 가기, 앱 목록 표시 이름)
  - 설정 폴더는 그대로 `%APPDATA%\Yusk Widget` (main.js 에서 고정) → 설정·키 이전 없음
  - 설치 폴더 `%LOCALAPPDATA%\Programs\yusk-widget`, 앱 ID com.yusk.widget 그대로 (기존 설치 위에 업그레이드)
  - 자동 실행: 실행할 때마다 새 실행 파일 경로로 다시 등록, 예전 `Yusk Widget.lnk` 는 지움
- 설치 화면: 한국어 단계형 설치(시작 → 설치 위치 → 진행 → 완료 + 바로 실행), 고양이 사이드바·머리 그림
- 앱 아이콘·트레이 아이콘: 새 고양이
- 처음 설정(온보딩) 0~8단계, 완료 알림, ⋯ 메뉴 다시 하기/이어서 하기
- 키 없는 기본 날씨(Open-Meteo), 현재 위치(Windows 위치 서비스 → 지역 이름)

## 배포 전에 직접 할 것
1. 구글 연결 — 2026-10-01 완료 (1.4.1)
   - OAuth 앱: 외부 · 프로덕션 게시, 미인증(사용자 100명 한도, 첫 연결 때 '확인되지 않은 앱' 경고)
   - 홈페이지·개인정보처리방침·약관: https://yusungkim-maker.github.io/personal_widget/ (docs/, GitHub Pages)
   - 배포용 클라이언트 `src/oauth-client.json` (git 제외, 빌드에 포함). 100명 넘으면 구글 인증 심사 필요
2. 코드 서명 인증서 (없으면 처음 실행 때 Windows "PC 보호" 경고)
3. 자동 업데이트(GitHub 릴리스) — 아직 없음

## 작업 규칙 (꼭 지킬 것)
- 설치·실행은 `.run/install.cmd` 를 explorer.exe 로 (격리 밖), 끝나면 install.log 로 키 3개·금고·자동 실행 확인
- 설치 전 `.run/safety.cmd` 로 실제 설정 사본 저장
- 개발용 캡처는 WIDGET_USERDATA 별도 폴더(금고·자동 실행도 실제 것을 안 건드림), 캡처 후 자동 종료
- 실제 화면 확인은 `.run/shot.cmd` — 확인한 것만 "된다"고 말하기
- .run 의 ps1 은 UTF-8 BOM 으로 저장 (PowerShell 5.1 한글)

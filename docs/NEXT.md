# 진행 상황

## 다음 할 일 (다음 주) — 위젯 위치: 모니터 모서리 자석 붙이기
요청(2026-10-02): 아무 데나 두면 불편하니 모니터 양 끝(모서리)에만 붙게.
- 자리: 모니터마다 네 모서리(위/아래 × 왼쪽/오른쪽), 듀얼이면 8곳. 가장자리 여백 약 12px
  - 위젯이 화면 높이의 60%보다 길면 위쪽 모서리만
- 잠금 아이콘: 시계 카드 ⋯ 옆에 자물쇠 버튼 → 위치 잠금 켜기/끄기 (설정·트레이 체크와 같은 값)
  - "바탕화면에 고정"(다른 창 뒤)은 그대로 두고, 잠금과 분리 (1.2.1 의 '고정=잠김' 규칙 되돌림)
- 잠금이 꺼져 있을 때 끌기: 자석처럼 처음 약 48px 까지는 안 따라오고(살짝 당겨지는 느낌만),
  그 이상 끌면 떨어져 나와 따라오고, 놓으면 가장 가까운 모니터 모서리로 미끄러지듯 붙음
- 구현 메모
  - 지금은 CSS `-webkit-app-region: drag`(widget.css 15행, `.drag` 클래스) → 직접 끌기로 교체
    (renderer pointerdown/move/up + 화면 좌표 → main IPC drag:start/move/end, setPosition)
  - main.js: defaultPosition/validPosition 대신 snapPosition(모니터, 모서리, 높이)·nearestSnap(x,y)
    resizeToContent 가 높이 바뀔 때 아래 모서리면 위치도 다시 맞춤, display 변경 시 다시 붙임
  - 저장: window.displayId / window.corner (온보딩 배치 단계가 이미 같은 이름을 씀 → onboarding.js place() 도 같은 함수로)
  - 트레이 '위치 초기화' → 주 모니터 오른쪽 위, 메뉴 '바탕화면에 고정' 옆 '위치 잠김' 문구 정리
  - 기존 위치(x=-2557)는 업데이트 후 가장 가까운 모서리(왼쪽 모니터 왼쪽 위)로 옮겨짐 → 사용자에게 미리 알리기

## 그 밖에 남은 것
- 처음 설정 AI 단계에 Claude Code 설치 안내, 홈페이지에 다운로드 버튼(GitHub 릴리스), 자동 업데이트
- 자동 복구(작업 스케줄러 10분 지킴이): 권한 확인에서 막힘 → 사용자 허락 받으면 진행

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

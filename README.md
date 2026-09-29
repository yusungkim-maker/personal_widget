# Yusk Widget

개인용 Windows 바탕화면 위젯 (Electron).

## 실행

```bash
npm start
```

작업 표시줄 트레이의 파란 원 아이콘을 우클릭하면 창 모드·투명도·크기·위치 잠금·클릭 통과·자동 실행·전국 날씨를 바꿀 수 있습니다. 위젯의 ⚙ 버튼은 전체 설정을 엽니다.

## 기능

| 영역 | 내용 | 데이터 |
|---|---|---|
| 시계 | 12/24시간제, 초 표시 | — |
| 날씨 | 기본 서울·성남 (최대 3곳), 시간별 예보, **전국 날씨** 창 (23개 도시 지도 + 24시간 그래프 + 3일 예보) | 기상청 단기예보 조회서비스 (data.go.kr) |
| 달력 | 월 달력, 공휴일, 일정, 다가오는 일정, **일정 추가·수정·삭제(구글 동기화)**, 날짜 있는 할 일 표시 | Google Calendar API (OAuth) + 비공개 iCal 주소 + 대한민국 공휴일 |
| 할 일 | 추가/완료/삭제, 날짜 지정(달력에 표시) | 로컬 저장 (구글에 동기화 안 함) |
| 메모 | 메모 목록 + 메모마다 포스트잇 팝업(자동 저장, 5가지 색, 여러 개 동시에), 뭉치에게 "메모해 줘" | 로컬 저장 |
| AI 비서 | 날씨·일정·할 일을 알고 답하는 채팅, 모델 선택, (Claude) 웹 검색 | Claude Code / Codex CLI 계정 로그인 (API 키 불필요) |

## 창 모드

- **바탕화면 고정**: 모든 창 뒤에 깔리고, Win+D(바탕화면 보기)를 눌러도 사라지지 않음
- **일반**: 보통 창처럼 동작
- **항상 위**: 모든 창 위에 표시 (투명도·클릭 통과와 같이 쓰면 좋음)

## 일정 등록 (구글 캘린더 동기화)

- 한 줄 빠른 추가: 달력 아래 입력칸에 `내일 3시 치과`, `금요일 2시~4시 크리 미팅 @회의실`, `10/15 종일 워크숍` → 미리보기 확인 후 Enter (Tab 은 자세히 입력)
- 자세히 입력: `+` 버튼 또는 날짜 두 번 누르기 → 날짜·종일·시간(길이 버튼)·장소·메모·알림. 제목에 날짜·시간을 적어도 알아서 채움. Ctrl+Enter 저장, Esc 닫기
- 등록한 일정은 눌러서 수정·삭제 (삭제는 한 번 더 눌러 확인)
- 저장하면 곧바로 달력에 표시(동기화 중), 실패하면 다시 시도 / 취소. 추가·수정·삭제 모두 알림에서 실행 취소 가능
- 뭉치에게 "내일 3시 치과 잡아줘", "금요일까지 보고서 할 일 넣어줘" → 등록 카드가 뜨고 [등록]을 눌러야 반영됨
- 한국어 날짜 해석기: `src/renderer/nlparse.js` (오늘/내일/모레, 요일·이번 주·다음 주, 월/일, N일 후, 오전·오후·저녁, 시·분·반, 범위, 기간, 종일, @장소)

연결 준비 (한 번만): Google Cloud 프로젝트 → Calendar API 사용 → OAuth 동의 화면(회사 계정은 "내부") → OAuth 클라이언트 "데스크톱 앱" JSON 다운로드 → 위젯 ⚙ → JSON 가져오기 → 구글 계정 연결.
권한은 `calendar.events` (일정만) + 계정 이메일. 토큰은 safeStorage 로 암호화 저장, 연결 해제 시 구글 쪽 권한도 철회. 연결된 계정과 같은 캘린더의 iCal 주소는 자동으로 건너뛰어 중복 표시를 막음.

## AI 비서 로그인

API 키 없이 구독 계정으로 호출합니다. (`codex-chatgpt-login-integration.md` 규칙 적용)

| 제공자 | 실행 파일 | 로그인 | 로그인 범위 |
|---|---|---|---|
| ChatGPT | 프로젝트에 고정 설치한 `@openai/codex@0.158.0` (Electron 내장 Node 로 실행) | ChatGPT 계정 OAuth | 위젯 전용 `CODEX_HOME` = `%LOCALAPPDATA%\Yusk Widget\codex-home` (Codex 앱과 분리) |
| Claude | Claude Code (`claude.exe`) | claude.ai 구독 | Claude Code 와 공유 |

성격·지침 (⚙ → AI 비서 성격·지침)
- 이름·프로필: 뭉치 — 실제 고양이 사진(푸른 회색 털, 큰 귀, 까만 눈, 노란 목걸이·체크 반다나)을 바탕으로 직접 그린 SVG 캐릭터 (`src/renderer/avatar.js`)
- 성격과 말투: 전문 비서(기본) / 친근한 / 초간결 프리셋 또는 직접 작성
- 고양이 말투(~냥): 성격은 그대로 두고 말끝만 바꾸는 옵션. 메일·메시지 초안 본문에는 적용 안 함
- 나에 대해 · 항상 지킬 지침: 새 대화를 시작해도 모든 질문에 자동 적용 (각 2000자)
- Claude 는 작업 폴더의 시스템 프롬프트 파일(`--system-prompt-file`)로, Codex 는 stdin 프롬프트 맨 앞으로 전달 (명령줄에 내용이 드러나지 않음)

안전장치
- 호출 직전마다 로그인 방식 확인 — ChatGPT 로그인 / claude.ai 구독 로그인일 때만 실행, 그 외(API 키·미확인)는 차단
- 자식 프로세스 환경변수는 allowlist 만 전달 (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 등은 절대 전달 안 함)
- `codex exec --ephemeral --ignore-user-config --ignore-rules --sandbox read-only --color never --cd <작업마다 새 임시 폴더> -c approval_policy="never" -`, 프롬프트는 stdin 으로만 전달
- stderr 는 읽고 버림 (프롬프트 에코가 있어 화면·로그에 노출하지 않음), 오류는 단계별 고정 문구로만 표시
- 입력 512 KiB / 출력 1~4 MiB 상한, 180초 timeout, 강제 종료 후 5초 대기, 실패 시 1회 재시도(남은 시간 안에서, 글자가 나오기 전만)
- `npm test` 로 위 규칙과 날짜 해석·구글 변환 검사

## 설정 파일

`%APPDATA%\Yusk Widget\config.json` — API 키는 Windows 암호화 저장소(safeStorage)로 암호화되어 저장됩니다.

## 폰트

[Pretendard](https://github.com/orioncactus/pretendard) 가변 폰트(v1.3.9, SIL OFL 1.1)를 `src/renderer/fonts/`에 포함해 두어서, PC에 설치하지 않아도 적용됩니다.

## 구조

```
src/main.js       창·트레이·IPC
src/win32.js      바탕화면 고정 (koffi 로 user32 호출)
src/weather.js    기상청 API, 격자 변환, 지역 검색(Nominatim), 캐시
src/calendar.js   iCal 읽기 (node-ical, 반복 일정 펼치기) + 구글 API 일정 합치기
src/gcal.js       Google Calendar API (OAuth 루프백 + PKCE, 일정 CRUD)
src/gcal-format.js 위젯 ↔ 구글 일정 변환
src/renderer/schedule.js  일정 등록 UX, 할 일 날짜, 뭉치 등록 카드
src/renderer/nlparse.js   한국어 날짜·시간 해석
src/memos.js      메모 저장·팝업 창 관리
src/renderer/memos.js     위젯의 메모 목록
src/renderer/memo.*       메모 팝업 (포스트잇)
src/llm.js        AI 비서 (Claude Code / 위젯 전용 Codex CLI 호출)
test/llm.test.js  로그인 연동 안전 규칙 테스트
src/renderer/     위젯(index) · 전국 날씨(nationwide) 화면
```

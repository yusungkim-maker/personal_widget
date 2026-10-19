// 타자 연습 단어 목록: 영어 자주 쓰는 200단어(몽키타입 english 와 같은 성격), 한국어 자주 쓰는 명사·동사·형용사·부사
window.TYPING_WORDS = {
  english: `the be of and a to in he have it that for they with as not on she at by this we you do but from or which one would
all will there say who make when can more if no man out other so what time up go about than into could state only new year some
take come these know see use get like then first any work now may such give over think most even find day also after way many must
look before great back through long where much should well people down own just because good each those feel seem how high too
place little world very still nation hand old life tell write become here show house both between need mean call develop under
last right move thing general school never same another begin while number part turn real leave might want point form off child
few small since against ask late home interest large person end open public follow during present without again hold govern
around possible head consider word program problem however lead system set order eye plan run keep face fact group play stand
increase early course change help line`.split(/\s+/),
  korean: `사람 시간 우리 생각 하나 정말 오늘 지금 이야기 세상 마음 사랑 친구 학교 가족 나라 문제 사회 경제 회사
대학 문화 역사 자연 바다 하늘 구름 바람 나무 꽃 아침 저녁 점심 주말 계절 여름 겨울 가을 봄 날씨 음식
커피 우유 과일 사과 김치 라면 밥 물 집 방 문 창문 의자 책상 컴퓨터 키보드 전화 사진 영화 음악 노래 게임
운동 축구 야구 공원 도시 시장 가게 은행 병원 약국 도서관 버스 지하철 기차 자동차 비행기 여행 공항 호텔 길
다리 산 강 섬 마을 동네 아이 어른 부모 아버지 어머니 형 누나 동생 할머니 할아버지 선생님 학생 의사 회의
일정 계획 목표 결과 이유 방법 기술 정보 소식 기사 신문 방송 인터넷 화면 글자 단어 문장 언어 한국어 영어
공부 숙제 시험 질문 대답 이름 나이 생일 선물 편지 약속 기억 꿈 희망 행복 웃음 눈물 걱정 용기 노력 성공
실패 변화 시작 끝 처음 마지막 내일 어제 나중 항상 가끔 다시 함께 혼자 모두 조금 많이 아주 너무 빨리
천천히 크다 작다 좋다 나쁘다 많다 적다 쉽다 어렵다 같다 다르다 오래 가다 오다 보다 듣다 말하다 읽다 쓰다
먹다 마시다 자다 일하다 놀다 만들다 찾다 알다 모르다 웃다 울다 걷다 달리다 앉다 서다 열다 닫다 주다 받다
사다 팔다 배우다 가르치다 기다리다 만나다 좋아하다 가방 가격 가구 가수 가슴 가운데 가지 각자 간식 감기 감자
감정 강아지 개 개발 개인 거리 거울 걸음 겨울잠 결정 결혼 경기 경찰 경험 계단 계약 고객 고기 고민 고양이
고향 곳 공기 공장 공책 과자 과정 과학 관계 관심 교실 교육 교통 구두 구멍 국가 국수 군대 권리 귀 규칙
그날 그림 극장 근처 글씨 기간 기계 기분 기회 기차역 긴장 김밥 껌 꽃병 꿀 끝말 나비 나이테 날개 남자 남쪽
낮 내용 냄새 냉장고 노트 놀이 농구 농담 눈 눈사람 뉴스 느낌 능력 다리미 단계 단풍 달 달력 닭 담요 답장
대화 대통령 도로 도움 도장 독서 돈 돌 동물 동쪽 두부 뒤 등산 딸 딸기 땀 땅 떡 뜻 라디오 라벨 레몬 리본
마당 마무리 마을버스 만두 만화 말씀 맛 매일 머리 먼지 메뉴 메모 면도 명절 모자 목소리 목욕 몸 무게 무대
문법 물건 미래 미소 민족 바닥 바지 박물관 반찬 발 발음 밤 방학 배 배추 버릇 번호 벌레 법 벽 별 병 보람
보리 보험 봉투 부엌 부탁 북쪽 분위기 불 비 비누 비밀 빵 뼈 사건 사무실 사실 사업 사이 사전 사탕 산책
상자 상처 새벽 색깔 생선 생활 서랍 서류 서쪽 선수 설명 설탕 성격 세탁기 소금 소리 소설 소파 속도 손 손님
손수건 수건 수박 수업 수요일 숟가락 술 숲 습관 시계 시골 시민 식당 식사 신발 실수 심장 쌀 쓰레기 아들
아파트 안경 안내 야채 약 양말 양복 어깨 언니 얼굴 엄마 아빠 여권 여자 연필 열쇠 엽서 영수증 예약 오빠
오이 옷 와인 요리 요일 욕실 우산 우체국 우표 운전 원숭이 월급 위치 유리 은행원 음료 의견 의미 이불 이웃
인사 인형 일기 일요일 입 잎 자리 자전거 잔치 잠 장갑 장난감 재료 저금 전기 전화기 점수 접시 젓가락 정류장
정원 제목 조건 조카 종이 주머니 주소 주인 준비 줄 중간 지갑 지도 지붕 직업 직장 질서 짐 집중 짝 차 창고
책 책장 천장 청소 체육 초대 촛불 출근 출발 충전 취미 층 치마 치약 친척 침대 칫솔 카메라 칼 커튼 컵 코
콩 크기 키 탁자 태양 택시 텔레비전 토끼 통장 퇴근 특징 티셔츠 파도 편의점 평일 포도 표 풍경 피아노 필통
하루 학년 한글 할인 항구 해 햇빛 허리 현관 현실 형제 호수 화분 화장실 환경 회색 휴가 휴대폰 흙 힘 가깝다
가볍다 같이 거의 건강하다 결국 계속 고르다 고맙다 곧 괜찮다 굉장히 귀엽다 그냥 그리다 그립다 기쁘다 길다
깊다 깨끗하다 꼭 끄다 끝나다 나가다 나누다 나오다 날다 남다 내리다 넓다 넣다 노랗다 놓다 높다 누르다 늦다
다니다 달다 닦다 대단하다 더 덥다 도착하다 돌아가다 돕다 두다 들어가다 따뜻하다 떠나다 떨어지다 뛰다 마치다
막히다 맑다 맛있다 맞다 맵다 멀다 멋지다 모으다 무겁다 묻다 미리 바꾸다 바로 바쁘다 반갑다 밝다 버리다 벌써
벗다 보내다 부르다 부드럽다 붙이다 비싸다 빌리다 빠르다 사라지다 살다 서두르다 세우다 슬프다 시원하다 신다
싫다 싸다 쌓다 쓰다듬다 씻다 아끼다 아름답다 아직 아프다 안다 알리다 어둡다 얼마나 없다 여전히 열심히 예쁘다
오르다 올리다 옮기다 외우다 움직이다 웃기다 이기다 이미 익다 일어나다 읽히다 입다 잊다 자르다 자주 작게 잘
잠그다 잡다 정하다 조용하다 졸리다 좁다 죽다 즐겁다 지나다 지키다 짧다 찍다 차갑다 참다 춥다 치다 켜다 타다
특히 틀리다 파랗다 편하다 피곤하다 피다 필요하다 하얗다 행복하다 헤어지다 화나다 훨씬 힘들다`.split(/\s+/),
};

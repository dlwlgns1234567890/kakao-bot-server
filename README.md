# 카카오톡 관리자 봇 서버

메신저봇R ↔ Railway 서버 ↔ SQLite DB 연동 구성입니다.

---

## 구조

```
카카오톡 메시지
    ↓
메신저봇R (LDPlayer 안)
    ↓  HTTP POST
Railway 서버 (이 프로젝트)
    ↓
SQLite DB 영구 저장
    ↓
웹 관리자 페이지 (브라우저로 접속)
```

---

## Railway 배포 방법 (무료)

### 1단계 — GitHub에 올리기

```bash
git init
git add .
git commit -m "init"
# GitHub에서 새 저장소 만들고 push
git remote add origin https://github.com/아이디/kakao-bot-server.git
git push -u origin main
```

### 2단계 — Railway 가입 & 배포

1. https://railway.app 접속 → GitHub으로 로그인
2. **New Project** → **Deploy from GitHub repo** 클릭
3. 방금 올린 저장소 선택
4. 자동으로 빌드 & 배포 시작됨

### 3단계 — 환경변수 설정

Railway 대시보드 → Variables 탭에서 아래 추가:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `API_KEY` | 아무 긴 문자열 | 메신저봇R 인증키 |
| `ADMIN_PW` | 관리자 비밀번호 | 웹페이지 로그인 |
| `ADMIN_NICKNAMES` | 닉네임1,닉네임2 | 봇 명령어 관리자 |
| `SESSION_SECRET` | 아무 긴 문자열 | 세션 암호화 |

### 4단계 — 도메인 확인

Railway → Settings → Domains에서 자동 생성된 주소 확인
예: `https://kakao-bot-server-production.up.railway.app`

---

## 메신저봇R 스크립트 설정

`메신저봇R_스크립트.js` 파일을 열어서:

```js
var SERVER_URL = "https://여기에-railway-주소.up.railway.app"; // ← Railway 주소
var API_KEY    = "change-this-secret-key"; // ← Railway에서 설정한 API_KEY와 동일하게
```

수정 후 메신저봇R 스크립트 편집창에 전체 붙여넣기 → 저장 → 활성화

---

## 웹 관리자 페이지 접속

브라우저에서 Railway 주소로 접속:
```
https://kakao-bot-server-production.up.railway.app
```

- 비밀번호: `ADMIN_PW`에 설정한 값
- 유저 목록, 밴 목록, 채팅 로그, 경고 관리 가능

---

## 명령어 목록

| 명령어 | 설명 |
|--------|------|
| `!도움말` | 명령어 목록 |
| `!내정보` | 내 정보 조회 |
| `!핑` | 봇 상태 확인 |
| `!밴 [닉네임] [사유]` | 영구 밴 (관리자) |
| `!언밴 [닉네임]` | 밴 해제 (관리자) |
| `!경고 [닉네임] [사유]` | 경고 부여, 3회 시 자동 밴 (관리자) |
| `!경고초기화 [닉네임]` | 경고 초기화 (관리자) |
| `!유저정보 [닉네임]` | 상세 정보 (관리자) |
| `!밴목록` | 밴 유저 목록 (관리자) |
| `!공지 [내용]` | 공지 전송 (관리자) |
| `!노트 [닉네임] [내용]` | 관리자 메모 저장 (관리자) |

---

## 주의사항

- Railway 무료 플랜은 월 $5 크레딧 제공 (소규모 봇은 충분)
- SQLite는 Railway 볼륨에 저장 — 재배포 시 데이터 유지됨
- 봇 전용 카카오 부계정 사용 필수

# 🎵 YouTube Jukebox

여러 사람이 같은 대기열을 공유하는 유튜브 주크박스입니다.
**클라이언트**가 곡을 추가/선택하면 **호스트** 화면에서 재생됩니다.

- 백엔드: **FastAPI** (WebSocket)
- 프론트엔드: **React + Vite** (WebSocket)
- DB: **SQLite**

## 기능

| 구분 | 기능 |
|---|---|
| 공통 | 같은 대기열 실시간 공유(WebSocket), 곡 추가/삭제 |
| 클라이언트(`/`) | 유튜브 **URL 추가** / **검색 추가**(키 불필요), 곡 ▶ 누르면 호스트에서 재생 |
| 호스트(`/host`) | 유튜브 플레이어 재생, 한 곡이 끝나면 **다음 곡 자동 재생**, 직접 재생/정지 버튼 |

### 동작 흐름
1. 호스트가 `/host` 접속 (재생 화면)
2. 클라이언트가 `/` 접속
3. 클라이언트가 곡 추가
4. 클라이언트가 곡 ▶ 클릭
5. 호스트 화면에서 재생

- 재생 중 다른 클라이언트가 곡을 추가해도 재생에는 영향이 없습니다.
- 호스트가 이미 재생 중일 때 클라이언트가 ▶ 를 누르면 **"호스트가 이미 재생상태입니다."** 알림이 뜹니다.

## 폴더 구조

```
youtube_player/
├─ backend/
│  ├─ app/
│  │  ├─ main.py          # FastAPI: REST + WebSocket + 정적 서빙
│  │  ├─ database.py      # SQLite(SQLAlchemy) 설정
│  │  ├─ models.py        # Song 모델
│  │  ├─ schemas.py       # 요청 스키마
│  │  ├─ youtube.py       # URL 파싱 / oEmbed / 검색
│  │  └─ ws_manager.py    # 연결 관리 + 재생 상태 + 브로드캐스트
│  └─ requirements.txt
├─ frontend/              # React + Vite
│  └─ src/
│     ├─ pages/ClientPage.tsx
│     ├─ pages/HostPage.tsx
│     ├─ useJukebox.ts        # WebSocket 훅
│     ├─ useYouTubePlayer.ts  # YouTube IFrame 플레이어 훅
│     └─ api.ts
└─ CLAUDE.md
```

## 실행 방법

### 1) 백엔드

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2) 프론트엔드

**개발 모드** (코드 수정 시 자동 반영, Vite 가 `/api`·`/ws` 를 8000으로 프록시):

```bash
cd frontend
npm install
npm run dev
# 클라이언트:  http://localhost:5173/
# 호스트:      http://localhost:5173/host
```

**배포(빌드) 모드** (백엔드가 빌드 결과를 직접 서빙):

```bash
cd frontend
npm run build        # frontend/dist 생성
# 이후 백엔드만 실행하면 됨
#   http://localhost:8000/        (클라이언트)
#   http://localhost:8000/host    (호스트)
```

> 다른 기기(폰 등)에서 접속하려면 호스트 PC의 IP로 접속하세요. 예: `http://192.168.0.10:8000/`

## 참고 / 한계

- 검색은 공식 API가 아닌 유튜브 검색 페이지 파싱이라, 유튜브가 구조를 바꾸면 깨질 수 있습니다(이때 URL 추가는 계속 동작).
- 브라우저 자동재생 정책상 호스트의 **첫 재생**은 플레이어를 한 번 클릭해야 할 수 있습니다. 이후 클라이언트 요청은 자동 반영됩니다.
- 임베드가 차단된 영상은 재생되지 않을 수 있습니다.

"""FastAPI 진입점: REST API + WebSocket + 정적(React 빌드) 서빙."""

import asyncio
import os

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import youtube
from .database import SessionLocal, init_db
from .models import Song
from .schemas import SongAddRequest
from .ws_manager import manager

app = FastAPI(title="YouTube Jukebox")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 큐 헬퍼
# ---------------------------------------------------------------------------
def _list_songs(db: Session) -> list[dict]:
    rows = db.scalars(select(Song).order_by(Song.created_at, Song.id)).all()
    return [s.to_dict() for s in rows]


async def _broadcast_queue():
    db = SessionLocal()
    try:
        songs = _list_songs(db)
    finally:
        db.close()
    await manager.broadcast({"type": "queue", "songs": songs})


async def _broadcast_playback():
    await manager.broadcast({"type": "playback", **manager.playback_state()})


def _get_song(db: Session, song_id: int) -> Song | None:
    return db.get(Song, song_id)


def _front_song(db: Session) -> Song | None:
    return db.scalars(
        select(Song).order_by(Song.created_at, Song.id).limit(1)
    ).first()


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------
@app.get("/api/songs")
def get_songs(db: Session = Depends(get_db)):
    return {"songs": _list_songs(db)}


@app.get("/api/state")
def get_state():
    return manager.playback_state()


@app.get("/api/search")
async def search(q: str):
    results = await asyncio.to_thread(youtube.search, q, 10)
    return {"results": results}


@app.post("/api/songs")
async def add_song(payload: SongAddRequest, db: Session = Depends(get_db)):
    video_id = payload.video_id
    if not video_id and payload.url:
        video_id = youtube.extract_video_id(payload.url)
    if not video_id or not youtube.is_valid_id(video_id):
        raise HTTPException(status_code=400, detail="유효한 유튜브 주소/ID가 아닙니다.")

    title = payload.title
    thumbnail = payload.thumbnail
    channel = payload.channel
    duration = payload.duration or ""

    # 제목 정보가 없으면 oEmbed로 보충
    if not title:
        meta = await asyncio.to_thread(youtube.fetch_metadata, video_id)
        title = meta["title"]
        thumbnail = thumbnail or meta["thumbnail"]
        channel = channel or meta["channel"]

    song = Song(
        video_id=video_id,
        title=title,
        thumbnail=thumbnail or f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
        channel=channel or "",
        duration=duration,
        added_by=payload.added_by or "익명",
    )
    db.add(song)
    db.commit()
    db.refresh(song)

    # 재생 중이어도 추가는 독립적으로 동작 (주의사항 1)
    await _broadcast_queue()
    return song.to_dict()


@app.delete("/api/songs/{song_id}")
async def delete_song(song_id: int, db: Session = Depends(get_db)):
    song = _get_song(db, song_id)
    if song:
        db.delete(song)
        db.commit()
        await _broadcast_queue()
    return {"ok": True}


# ---------------------------------------------------------------------------
# 재생 오케스트레이션
# ---------------------------------------------------------------------------
async def _play_song_id(song_id: int) -> bool:
    db = SessionLocal()
    try:
        song = _get_song(db, song_id)
        song_dict = song.to_dict() if song else None
    finally:
        db.close()
    if not song_dict:
        return False
    manager.start_playing(song_dict)
    await manager.send_to_hosts({"type": "play", "song": song_dict})
    await _broadcast_playback()
    return True


async def _handle_play_request(websocket: WebSocket, song_id: int):
    if manager.host_count == 0:
        await manager.send_personal(
            websocket, {"type": "error", "message": "호스트가 아직 접속하지 않았습니다."}
        )
        return
    if manager.is_playing:
        await manager.send_personal(
            websocket, {"type": "error", "message": "호스트가 이미 재생상태입니다."}
        )
        return
    ok = await _play_song_id(song_id)
    if not ok:
        await manager.send_personal(
            websocket, {"type": "error", "message": "이미 삭제된 곡입니다."}
        )


async def _handle_ended():
    """호스트에서 곡이 끝남: 현재 곡 삭제 후, 다음 곡 자동 재생."""
    current = manager.current_song
    db = SessionLocal()
    try:
        if current:
            song = _get_song(db, current["id"])
            if song:
                db.delete(song)
                db.commit()
        nxt = _front_song(db)
        next_id = nxt.id if nxt else None
    finally:
        db.close()

    manager.stop_playing()
    await _broadcast_queue()  # 1-2: 다음 곡 시작 전 최신 리스트 갱신

    if next_id is not None:
        await _play_song_id(next_id)
    else:
        await _broadcast_playback()


async def _handle_host_play(song_id: int | None):
    """호스트 자체 재생 버튼 (1-3)."""
    if manager.is_playing:
        await manager.send_to_hosts(
            {"type": "error", "message": "이미 재생 중입니다."}
        )
        return
    target_id = song_id
    if target_id is None:
        db = SessionLocal()
        try:
            front = _front_song(db)
            target_id = front.id if front else None
        finally:
            db.close()
    if target_id is None:
        await manager.send_to_hosts(
            {"type": "error", "message": "대기열이 비어 있습니다."}
        )
        return
    await _play_song_id(target_id)


async def _handle_host_stop():
    manager.stop_playing()
    await manager.send_to_hosts({"type": "stop"})
    await _broadcast_playback()


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
@app.websocket("/ws/{role}")
async def websocket_endpoint(websocket: WebSocket, role: str):
    role = "host" if role == "host" else "client"
    await manager.connect(websocket, role)

    # 접속 직후 현재 상태 전송
    db = SessionLocal()
    try:
        songs = _list_songs(db)
    finally:
        db.close()
    await manager.send_personal(websocket, {"type": "queue", "songs": songs})
    await manager.send_personal(
        websocket, {"type": "playback", **manager.playback_state()}
    )
    # 호스트 접속 시 모두에게 host_online 갱신
    if role == "host":
        await _broadcast_playback()

    try:
        while True:
            data = await websocket.receive_json()
            mtype = data.get("type")

            if mtype == "play_request":
                await _handle_play_request(websocket, int(data.get("song_id")))
            elif mtype == "ended" and role == "host":
                await _handle_ended()
            elif mtype == "host_play" and role == "host":
                sid = data.get("song_id")
                await _handle_host_play(int(sid) if sid is not None else None)
            elif mtype == "host_stop" and role == "host":
                await _handle_host_stop()
            elif mtype == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        if role == "host" and manager.host_count == 0:
            # 호스트가 모두 나가면 재생 상태 초기화
            manager.stop_playing()
        await _broadcast_playback()
    except Exception:
        manager.disconnect(websocket)
        await _broadcast_playback()


# ---------------------------------------------------------------------------
# 정적 파일 (React 빌드) 서빙 — dist 가 있을 때만
# ---------------------------------------------------------------------------
_DIST_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "dist"
)
_DIST_DIR = os.path.abspath(_DIST_DIR)

if os.path.isdir(_DIST_DIR):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(_DIST_DIR, "assets")),
        name="assets",
    )

    @app.get("/")
    @app.get("/host")
    async def _spa_root():
        return FileResponse(os.path.join(_DIST_DIR, "index.html"))

    @app.get("/{full_path:path}")
    async def _spa_fallback(full_path: str):
        candidate = os.path.join(_DIST_DIR, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST_DIR, "index.html"))

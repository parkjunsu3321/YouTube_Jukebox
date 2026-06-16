"""WebSocket 연결 관리 + 재생 상태 보관 + 브로드캐스트."""

import asyncio
from typing import Optional

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[WebSocket, str] = {}  # ws -> role("host"|"client")
        self._lock = asyncio.Lock()
        # 재생 상태
        self.is_playing: bool = False
        self.current_song: Optional[dict] = None

    # ---- 연결 관리 ----
    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        async with self._lock:
            self._connections[websocket] = role

    def disconnect(self, websocket: WebSocket):
        self._connections.pop(websocket, None)

    @property
    def host_count(self) -> int:
        return sum(1 for r in self._connections.values() if r == "host")

    @property
    def client_count(self) -> int:
        return sum(1 for r in self._connections.values() if r == "client")

    # ---- 전송 ----
    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            self.disconnect(websocket)

    async def broadcast(self, message: dict):
        for ws in list(self._connections.keys()):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)

    async def send_to_hosts(self, message: dict):
        for ws, role in list(self._connections.items()):
            if role == "host":
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect(ws)

    # ---- 재생 상태 ----
    def start_playing(self, song: dict):
        self.is_playing = True
        self.current_song = song

    def stop_playing(self):
        self.is_playing = False
        self.current_song = None

    def playback_state(self) -> dict:
        return {
            "is_playing": self.is_playing,
            "current_song": self.current_song,
            "host_online": self.host_count > 0,
        }


manager = ConnectionManager()

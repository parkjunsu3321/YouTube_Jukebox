"""요청/응답 Pydantic 스키마."""

from typing import Optional

from pydantic import BaseModel


class SongAddRequest(BaseModel):
    # url 또는 video_id 중 하나는 있어야 한다.
    url: Optional[str] = None
    video_id: Optional[str] = None
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    channel: Optional[str] = None
    duration: Optional[str] = None
    added_by: str = "익명"


class SearchResult(BaseModel):
    video_id: str
    title: str
    thumbnail: str
    channel: str = ""
    duration: str = ""

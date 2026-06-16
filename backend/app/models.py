"""DB 모델: 대기열에 들어있는 노래."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    video_id: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail: Mapped[str] = mapped_column(String(500), default="")
    channel: Mapped[str] = mapped_column(String(300), default="")
    duration: Mapped[str] = mapped_column(String(20), default="")
    added_by: Mapped[str] = mapped_column(String(100), default="익명")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "video_id": self.video_id,
            "title": self.title,
            "thumbnail": self.thumbnail,
            "channel": self.channel,
            "duration": self.duration,
            "added_by": self.added_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

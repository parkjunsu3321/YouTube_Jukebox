import { useState } from "react";
import { Link } from "react-router-dom";
import { addSong, deleteSong, searchSongs } from "../api";
import Toast from "../components/Toast";
import type { SearchResult } from "../types";
import { useJukebox } from "../useJukebox";

export default function ClientPage() {
  const { connected, songs, playback, error, clearError, send } =
    useJukebox("client");

  const [tab, setTab] = useState<"url" | "search">("url");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => setToast(m);

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await addSong({ url: url.trim() });
      setUrl("");
      notify("대기열에 추가했어요.");
    } catch (e: any) {
      notify(e.message ?? "추가에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await searchSongs(query.trim());
      setResults(r);
      if (r.length === 0) notify("검색 결과가 없어요.");
    } catch (e: any) {
      notify(e.message ?? "검색에 실패했어요.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddResult = async (r: SearchResult) => {
    try {
      await addSong({
        video_id: r.video_id,
        title: r.title,
        thumbnail: r.thumbnail,
        channel: r.channel,
        duration: r.duration,
      });
      notify(`추가: ${r.title}`);
    } catch (e: any) {
      notify(e.message ?? "추가에 실패했어요.");
    }
  };

  const requestPlay = (songId: number) => {
    if (!playback.host_online) {
      notify("호스트가 아직 접속하지 않았어요.");
      return;
    }
    send({ type: "play_request", song_id: songId });
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>🎵 노래 예약</h1>
        <div className="status">
          <span className="dot" style={{ background: connected ? "#2ecc71" : "#ff4b4b" }} />
          {connected ? "연결됨" : "연결 끊김"}
          <span style={{ margin: "0 4px" }}>·</span>
          호스트 {playback.host_online ? "온라인" : "오프라인"}
          <Link className="role-link" to="/host" style={{ marginLeft: 10 }}>
            호스트 화면 →
          </Link>
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div className="tabs">
            <button
              className={`tab ${tab === "url" ? "active" : ""}`}
              onClick={() => setTab("url")}
            >
              🔗 주소로 추가
            </button>
            <button
              className={`tab ${tab === "search" ? "active" : ""}`}
              onClick={() => setTab("search")}
            >
              🔍 검색으로 추가
            </button>
          </div>

          {tab === "url" ? (
            <div className="row">
              <input
                type="text"
                placeholder="유튜브 주소를 붙여넣기"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              />
              <button className="primary" disabled={busy} onClick={handleAddUrl}>
                추가
              </button>
            </div>
          ) : (
            <>
              <div className="row">
                <input
                  type="text"
                  placeholder="예: 아이유 좋은날"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button className="primary" disabled={searching} onClick={handleSearch}>
                  {searching ? "검색 중…" : "검색"}
                </button>
              </div>
              <div className="list" style={{ marginTop: 12 }}>
                {results.map((r) => (
                  <div className="song" key={r.video_id}>
                    <img src={r.thumbnail} alt="" />
                    <div className="meta">
                      <div className="title">{r.title}</div>
                      <div className="sub">
                        {[r.channel, r.duration].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="primary" onClick={() => handleAddResult(r)}>
                        추가
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="hint">
            곡을 추가한 뒤 대기열에서 ▶ 를 누르면 호스트 화면에서 재생됩니다.
            호스트가 이미 재생 중이면 알림이 떠요.
          </div>
        </div>

        <div className="panel">
          <h2>📋 대기열 ({songs.length})</h2>
          {playback.current_song && (
            <div className="now-banner">
              <img
                src={playback.current_song.thumbnail}
                alt=""
                style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 6 }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="label">● 재생 중</div>
                <div className="title" style={{ fontSize: "0.85rem" }}>
                  {playback.current_song.title}
                </div>
              </div>
            </div>
          )}
          <div className="list">
            {songs.length === 0 && <div className="empty">아직 예약된 곡이 없어요.</div>}
            {songs.map((s) => {
              const isCurrent = playback.current_song?.id === s.id;
              return (
                <div className={`song ${isCurrent ? "current" : ""}`} key={s.id}>
                  <img src={s.thumbnail} alt="" />
                  <div className="meta">
                    <div className="title">{s.title}</div>
                    <div className="sub">
                      {[s.channel, s.duration].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="play"
                      title="호스트에서 재생"
                      onClick={() => requestPlay(s.id)}
                    >
                      ▶
                    </button>
                    <button
                      className="danger"
                      title="삭제"
                      onClick={() => deleteSong(s.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Toast message={toast ?? error} onClose={toast ? () => setToast(null) : clearError} />
    </div>
  );
}

import type { SearchResult, Song } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchSongs(): Promise<Song[]> {
  const data = await handle<{ songs: Song[] }>(await fetch("/api/songs"));
  return data.songs;
}

export async function searchSongs(query: string): Promise<SearchResult[]> {
  const data = await handle<{ results: SearchResult[] }>(
    await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  );
  return data.results;
}

export async function addSong(payload: {
  url?: string;
  video_id?: string;
  title?: string;
  thumbnail?: string;
  channel?: string;
  duration?: string;
  added_by?: string;
}): Promise<Song> {
  return handle<Song>(
    await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteSong(id: number): Promise<void> {
  await handle(await fetch(`/api/songs/${id}`, { method: "DELETE" }));
}

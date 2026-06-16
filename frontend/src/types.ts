export interface Song {
  id: number;
  video_id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration: string;
  added_by: string;
  created_at: string | null;
}

export interface PlaybackState {
  is_playing: boolean;
  current_song: Song | null;
  host_online: boolean;
}

export interface SearchResult {
  video_id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration: string;
}

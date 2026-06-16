"""유튜브 URL 파싱 / 메타데이터(oEmbed) / 키 없는 검색."""

import json
import re
import urllib.parse

import requests

_ID_RE = re.compile(r"[0-9A-Za-z_-]{11}")
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def is_valid_id(vid: str) -> bool:
    return bool(vid) and bool(re.fullmatch(r"[0-9A-Za-z_-]{11}", vid))


def extract_video_id(url: str):
    """다양한 형태의 유튜브 URL에서 11자리 video id를 추출."""
    if not url:
        return None
    url = url.strip()
    if is_valid_id(url):
        return url
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if host == "youtu.be":
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid if is_valid_id(vid) else None

    if host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        qs = urllib.parse.parse_qs(parsed.query)
        if "v" in qs and is_valid_id(qs["v"][0]):
            return qs["v"][0]
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
            return parts[1] if is_valid_id(parts[1]) else None

    m = _ID_RE.search(url)
    return m.group(0) if m else None


def fetch_metadata(video_id: str) -> dict:
    """oEmbed로 제목/썸네일/채널을 가져온다. (API 키 불필요)"""
    title = video_id
    thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    channel = ""
    try:
        resp = requests.get(
            "https://www.youtube.com/oembed",
            params={
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "format": "json",
            },
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            title = data.get("title", title)
            thumbnail = data.get("thumbnail_url", thumbnail)
            channel = data.get("author_name", "")
    except requests.RequestException:
        pass
    return {
        "video_id": video_id,
        "title": title,
        "thumbnail": thumbnail,
        "channel": channel,
        "duration": "",
    }


def _extract_balanced_json(html: str, marker: str):
    idx = html.find(marker)
    if idx == -1:
        return None
    start = html.find("{", idx)
    if start == -1:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(html)):
        c = html[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return html[start : i + 1]
    return None


def search(query: str, max_results: int = 10) -> list:
    """API 키 없이 유튜브 검색 결과 페이지를 파싱한다."""
    if not query or not query.strip():
        return []
    try:
        resp = requests.get(
            "https://www.youtube.com/results",
            params={"search_query": query, "hl": "ko", "gl": "KR"},
            headers={
                "User-Agent": _USER_AGENT,
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            },
            timeout=8,
        )
    except requests.RequestException:
        return []
    if not resp.ok:
        return []

    raw = _extract_balanced_json(resp.text, "ytInitialData")
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    results = []
    seen = set()

    def walk(node):
        if len(results) >= max_results:
            return
        if isinstance(node, dict):
            vr = node.get("videoRenderer")
            if isinstance(vr, dict):
                vid = vr.get("videoId")
                if is_valid_id(vid) and vid not in seen:
                    title = ""
                    t = vr.get("title", {})
                    if t.get("runs"):
                        title = t["runs"][0].get("text", "")
                    elif t.get("simpleText"):
                        title = t["simpleText"]
                    length = vr.get("lengthText", {})
                    length = length.get("simpleText", "") if isinstance(length, dict) else ""
                    channel = ""
                    ot = vr.get("ownerText", {})
                    if ot.get("runs"):
                        channel = ot["runs"][0].get("text", "")
                    seen.add(vid)
                    results.append(
                        {
                            "video_id": vid,
                            "title": title or vid,
                            "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                            "channel": channel,
                            "duration": length,
                        }
                    )
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    return results[:max_results]

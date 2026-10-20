#!/usr/bin/env python3
"""공연예술통합전산망(KOPIS) OPEN API로 숲세권 라이브 공연과 공연장 정보를 갱신한다.

API 문서: docs/KOPIS_API.md (개발가이드 v5.0 기준)
- 공연목록  GET /openApi/restful/pblprfr          (stdate~eddate 최대 31일, rows 최대 100)
- 공연상세  GET /openApi/restful/pblprfr/{공연ID}
- 시설상세  GET /openApi/restful/prfplc/{시설ID}

동작
- 기본(5분마다): 지난 60일~앞으로 400일을 31일 단위로 나눠, 어제 이후 등록·수정된(afterdate) 공연만 조회한다.
- --full(매일 새벽): 2021-07부터 앞으로 400일까지 전부 다시 조회하고 공연장 정보도 갱신한다.
- KOPIS 최종수정일(updatedate)에서 15분이 지난 공연만 반영한다. 덜 지난 것은 다음 실행 때 다시 본다.
- 사람이 정한 값(title, artist, subtitle, series, intro, openAt, soldOut)은 덮어쓰지 않는다.
- data/overrides.json의 값이 마지막에 우선 적용된다.
- 포스터는 assets/posters/에 내려받는다(실패하면 KOPIS https 주소를 그대로 쓴다).

환경 변수: KOPIS_API_KEY
출처: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "shows.json"
VENUES_FILE = ROOT / "data" / "venues.json"
OVERRIDES = ROOT / "data" / "overrides.json"
POSTERS = ROOT / "assets" / "posters"
BASE = os.environ.get("KOPIS_BASE", "https://kopis.or.kr/openApi/restful")

HOLD = timedelta(minutes=15)
WINDOW = 31                       # 공연목록 한 번에 조회 가능한 최대 일수
FIRST_DAY = date(2021, 7, 1)      # 숲세권 라이브 시작
REQUEST_GAP = 0.2                 # 초당 10회 제한보다 넉넉하게
SEARCHES = [("shprfnmfct", "숲세권"), ("shprfnm", "숲세권")]
FACILITIES = {                    # KOPIS 공연시설 ID → (사이트 지점 키, 지점 이름)
    "FC003092": ("mullae", "문래점"),
    "FC005062": ("kind", "카인드스퀘어점"),
}
OTHER_VENUE_NAMES = {"FC003053": "주말극장", "FC001708": "대구 한영아트센터", "FC003954": "예스24 원더로크홀"}
HUMAN_FIELDS = ("title", "artist", "subtitle", "series", "intro", "openAt", "soldOut")


def now_kst() -> datetime:
    return datetime.now(KST)


# ---------- HTTP ----------
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 forrestlive-sync/2.1")


def fetch(url: str, retries: int = 3) -> bytes:
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/xml,text/xml,*/*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            time.sleep(REQUEST_GAP)
            return body
        except urllib.error.HTTPError as e:
            snippet = ""
            try:
                snippet = e.read()[:300].decode("utf-8", "replace")
            except Exception:
                pass
            last = f"HTTP {e.code} {e.reason} | {snippet}"
            time.sleep(2 * (i + 1))
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"요청 실패: {url.split('?')[0]} ({last})")


def service_key() -> str:
    """Secret에 키 외의 글(공백, 줄바꿈, 문서 전체 등)이 섞여 있어도 32자리 키만 꺼낸다."""
    raw = os.environ.get("KOPIS_API_KEY", "")
    m = re.search(r"\b[0-9a-fA-F]{32}\b", raw)
    return m.group(0) if m else raw.strip()


def api(path: str, **params) -> ET.Element:
    params["service"] = service_key()
    root = ET.fromstring(fetch(f"{BASE}/{path}?{urllib.parse.urlencode(params)}"))
    if root.tag != "dbs" and root.find(".//db") is None:
        raise RuntimeError(f"KOPIS 응답 오류: {ET.tostring(root, encoding='unicode')[:300]}")
    return root


def t(el: ET.Element, tag: str) -> str:
    return (el.findtext(tag) or "").strip()


# ---------- 조회 ----------
def windows(start: date, end: date):
    cur = start
    while cur <= end:
        last = min(cur + timedelta(days=WINDOW - 1), end)
        yield cur, last
        cur = last + timedelta(days=1)


def list_ids(full: bool) -> list[str]:
    today = now_kst().date()
    start = FIRST_DAY if full else today - timedelta(days=60)
    end = today + timedelta(days=400)
    after = None if full else (today - timedelta(days=1)).strftime("%Y%m%d")
    ids: list[str] = []
    for a, b in windows(start, end):
        for key, value in SEARCHES:
            page = 1
            while True:
                params = {"stdate": a.strftime("%Y%m%d"), "eddate": b.strftime("%Y%m%d"), "cpage": page, "rows": 100, key: value}
                if after:
                    params["afterdate"] = after
                dbs = api("pblprfr", **params).findall("db")
                for db in dbs:
                    pid = t(db, "mt20id")
                    if pid and pid not in ids:
                        ids.append(pid)
                if len(dbs) < 100:
                    break
                page += 1
    return ids


def detail(pid: str) -> dict | None:
    db = api(f"pblprfr/{pid}").find("db")
    if db is None:
        return None
    return {
        "id": t(db, "mt20id"), "name": t(db, "prfnm"), "from": t(db, "prfpdfrom"), "to": t(db, "prfpdto"),
        "facility": t(db, "mt10id"), "facilityName": t(db, "fcltynm"), "cast": t(db, "prfcast"),
        "runtime": t(db, "prfruntime"), "age": t(db, "prfage"), "price": t(db, "pcseguidance"),
        "poster": t(db, "poster"), "times": t(db, "dtguidance"), "state": t(db, "prfstate"),
        "hosts": " ".join(t(db, k) for k in ("entrpsnmH", "entrpsnmS", "entrpsnmA", "entrpsnmP", "entrpsnm")),
        "sty": t(db, "sty"), "styurls": [u.text.strip() for u in db.findall("styurls/styurl") if u.text],
        "relates": [(t(r, "relatenm"), t(r, "relateurl")) for r in db.findall("relates/relate") if t(r, "relateurl")],
        "updated": t(db, "updatedate"),
    }


def venue_detail(fid: str) -> dict:
    db = api(f"prfplc/{fid}").find("db")
    if db is None:
        return {}
    return {"kopisId": fid, "kopisName": t(db, "fcltynm"), "address": t(db, "adres"), "tel": t(db, "telno"),
            "lat": float(t(db, "la") or 0), "lng": float(t(db, "lo") or 0), "homepage": t(db, "relateurl")}


# ---------- 값 다듬기 ----------
DESC = r"(단독\s*(?:공연|콘서트)|1st\s*팬\s*콘서트|첫\s*팬\s*콘서트|팬\s*콘서트|음감회|어쿠스틱\s*공연|쇼케이스)"


def parse_name(name: str, cast: str) -> dict:
    n = re.sub(r"^\s*숲세권\s*라이브\s*[,:：]\s*", "", name)
    n = re.sub(r"MONDAY\s*:\s*SOOP", "MONDAY:SOOP", n).strip()
    if "MONDAY" in n or "먼데이프로젝트" in n:
        rest = re.sub(r"먼데이프로젝트\s*[Xx×]\s*숲세권\s*,?\s*", "", n)
        rest = re.sub(r"MONDAY:SOOP\s*,?\s*", "", rest).strip(" ,")
        head, _, tail = rest.partition(":")
        artist = re.sub(DESC, "", head).strip(" ,") or first_cast(cast)
        sub = "MONDAY:SOOP 단독 콘서트" + (f", {tail.strip()}" if tail.strip() else "")
        return {"title": artist, "artist": artist, "subtitle": sub, "series": "MONDAY:SOOP"}
    series = "Urban Tune Forest" if "Urban Tune Forest" in n else ""
    n = re.sub(r"숲세권\s*라이브\s*[Xx]\s*Urban Tune Forest\s*,?\s*(숲세권 라이브,\s*)?", "", n).strip()
    head, sep, tail = n.rpartition(":")
    if not sep:
        head, sep, tail = n.rpartition(",")
    if not sep:
        head, tail = n, ""
    head, tail = head.strip(), tail.strip()
    m = re.search(DESC, head)
    subtitle = m.group(1) if m else ""
    artist = re.sub(DESC, "", head).strip(" ,") or first_cast(cast)
    return {"title": tail or head, "artist": artist, "subtitle": subtitle, "series": series}


def first_cast(cast: str) -> str:
    return re.split(r"[,、]", cast)[0].strip() if cast else ""


def series_from_hosts(hosts: str, name: str) -> str:
    if re.search(r"MONDAY|먼데이", name):
        return "MONDAY:SOOP"
    if "Urban Tune Forest" in name:
        return "Urban Tune Forest"
    if re.search(r"숲세권|폰드|굿덕|GoodDuck", hosts, re.I):
        return "숲세권 라이브"
    if re.search(r"엔터크라우드|먼데이", hosts):
        return "공동기획"
    return "대관 공연"


def hm(h: str, m: str) -> str:
    h = int(h)
    return f"{'오전' if h < 12 else '오후'} {h % 12 or 12}시" + (f" {int(m)}분" if int(m) else "")


def parse_times(dt: str) -> tuple[str, str]:
    """'토요일(15:00,19:00)' → ('15:00', '오후 3시 · 오후 7시'). 요일마다 시각이 다르면 요일도 붙인다."""
    groups = re.findall(r"([^,()]+?)\s*\(([\d:,\s]+)\)", dt or "")
    found = re.findall(r"(\d{1,2}):(\d{2})", dt or "")
    if not found:
        return "", ""
    first = f"{int(found[0][0]):02d}:{found[0][1]}"
    note = ""
    if len(groups) > 1 and len({g[1] for g in groups}) > 1:
        note = ", ".join(f"{re.sub('요일', '', g[0]).replace('HOL', '공휴일').strip()} " + " · ".join(hm(*x) for x in re.findall(r"(\d{1,2}):(\d{2})", g[1])) for g in groups)
    elif len(found) > 1:
        note = " · ".join(hm(h, m) for h, m in found[:4])
    return first, note


def kdate(s: str) -> str:
    return s.replace(".", "-") if s else ""


def kopis_time(s: str) -> datetime | None:
    try:
        return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
    except ValueError:
        return None


def https(u: str) -> str:
    return re.sub(r"^http://", "https://", u or "")


def ticket_site(name: str, url: str) -> str:
    if "melon" in url:
        return "멜론티켓"
    if "naver" in url:
        return "네이버 예약"
    if "yes24" in url:
        return "예스24"
    if "interpark" in url or "nol.yanolja" in url:
        return "NOL"
    return (name or "예매처").replace("네이버N예약", "네이버 예약")


def save_poster(pid: str, url: str) -> str:
    if not url:
        return ""
    POSTERS.mkdir(parents=True, exist_ok=True)
    out = POSTERS / f"{pid}.jpg"
    rel = f"assets/posters/{pid}.jpg"
    if out.exists():
        return rel
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(fetch(https(url)))).convert("RGB")
        img.thumbnail((900, 1200))
        img.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        return rel
    except Exception as e:
        print(f"  포스터 저장 실패 {pid}: {e}", file=sys.stderr)
        return https(url)


# ---------- 병합 ----------
def to_show(d: dict, existing: dict | None, download: bool) -> dict:
    venue, venue_name = FACILITIES.get(d["facility"], ("other", OTHER_VENUE_NAMES.get(d["facility"], re.sub(r"\s*\(.*\)\s*$", "", d["facilityName"]))))
    start, note = parse_times(d["times"])
    tickets = []
    for name, url in d["relates"]:
        url = https(url)
        if not any(x["url"] == url for x in tickets):
            tickets.append({"site": ticket_site(name, url), "url": url})
    sty = re.sub(r"^\s*\[?공연\s*소개\]?\s*", "", re.sub(r"\s+", " ", d.get("sty", ""))).strip()
    show = {
        "id": d["id"].lower(), "kopisId": d["id"],
        "date": kdate(d["from"]), "endDate": kdate(d["to"]), "time": start, "timeNote": note, "times": d["times"],
        "venue": venue, "venueName": venue_name,
        "price": d["price"].replace("<br />", ", ").replace("<br/>", ", "), "runtime": d["runtime"], "age": d["age"],
        "lineup": [c.strip() for c in re.split(r"[,、]", d["cast"]) if c.strip() and c.strip() != "등"],
        "poster": (save_poster(d["id"], d["poster"]) if download else https(d["poster"])),
        "introImages": [https(u) for u in d.get("styurls", [])],
        "tickets": tickets, "kopisUpdated": d["updated"], "source": "KOPIS",
    }
    if existing:
        for k in HUMAN_FIELDS:
            if existing.get(k) not in (None, ""):
                show[k] = existing[k]
        if str(existing.get("poster", "")).startswith("assets/posters/"):
            show["poster"] = existing["poster"]
    parsed = parse_name(d["name"], d["cast"])
    for k in ("title", "artist", "subtitle"):
        show.setdefault(k, parsed[k])
    if not show.get("series"):
        show["series"] = parsed["series"] or series_from_hosts(d.get("hosts", ""), d["name"])
    show.setdefault("intro", sty)
    if not show.get("intro"):
        show["intro"] = sty
    show.setdefault("openAt", "")
    show.setdefault("soldOut", False)
    return show


def find_existing(shows: list[dict], d: dict) -> dict | None:
    for s in shows:
        if s.get("kopisId") == d["id"] or s["id"] == d["id"].lower():
            return s
    melon = [re.search(r"prodId=(\d+)", u).group(1) for _, u in d["relates"] if re.search(r"prodId=(\d+)", u)]
    for s in shows:
        if not s.get("kopisId") and melon and s["id"] == f"m{melon[0]}":
            return s
    return None


def apply_overrides(shows: list[dict]) -> None:
    if not OVERRIDES.exists():
        return
    over = json.loads(OVERRIDES.read_text(encoding="utf-8")).get("shows", {})
    for key, values in over.items():
        for s in shows:
            if key in (s["id"], s.get("kopisId")):
                s.update({k: v for k, v in values.items() if not k.startswith("_")})


def sync(ids: list[str], get_detail, full: bool, no_hold: bool, download: bool) -> int:
    doc = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {"shows": []}
    shows: list[dict] = doc["shows"]
    before = json.dumps(shows, ensure_ascii=False, sort_keys=True)
    known = {s.get("kopisId"): s.get("kopisUpdated", "") for s in shows if s.get("kopisId")}
    now = now_kst()
    waiting = 0
    for pid in ids:
        d = get_detail(pid)
        if not d:
            continue
        if d["facility"] not in FACILITIES and "숲세권" not in d["name"] and not re.search(r"숲세권|폰드|굿덕", d.get("hosts", "")):
            continue
        if not full and known.get(pid) == d["updated"]:
            continue
        changed = kopis_time(d["updated"])
        if changed and not no_hold and now - changed < HOLD:
            waiting += 1
            print(f"  대기 {pid} (KOPIS 수정 {d['updated'][:16]}, 15분 지난 뒤 반영)")
            continue
        old = find_existing(shows, d)
        new = to_show(d, old, download)
        if old:
            shows[shows.index(old)] = new
            print(f"  수정 {pid} {new['date']} {new['title']}")
        else:
            shows.append(new)
            print(f"  추가 {pid} {new['date']} {new['title']}")
    apply_overrides(shows)
    shows.sort(key=lambda s: (s["date"], s.get("time", ""), s["id"]))
    if json.dumps(shows, ensure_ascii=False, sort_keys=True) != before:
        doc.update({"updated": now.strftime("%Y-%m-%dT%H:%M"), "source": "공연예술통합전산망(KOPIS)", "shows": shows})
        DATA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"data/shows.json 갱신 (공연 {len(shows)}개)")
    else:
        print("변경 없음")
    if waiting:
        print(f"15분 대기 중 {waiting}건")
    return 0


def sync_venues() -> None:
    venues = json.loads(VENUES_FILE.read_text(encoding="utf-8")) if VENUES_FILE.exists() else {}
    for fid, (key, name) in FACILITIES.items():
        v = venue_detail(fid)
        if v:
            venues.setdefault(key, {"name": name}).update(v)
    VENUES_FILE.write_text(json.dumps(venues, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="전체 기간을 다시 맞춘다")
    ap.add_argument("--no-hold", action="store_true", help="15분 대기 없이 바로 반영")
    args = ap.parse_args()
    if not os.environ.get("KOPIS_API_KEY"):
        print("KOPIS_API_KEY가 없습니다. GitHub 저장소 Settings > Secrets에 등록하세요.", file=sys.stderr)
        return 1
    if len(os.environ["KOPIS_API_KEY"].strip()) != 32:
        print(f"주의: KOPIS_API_KEY 값이 {len(os.environ['KOPIS_API_KEY'])}자입니다. 32자리 키만 넣어 두는 것이 좋습니다.", file=sys.stderr)
    if args.full:
        try:
            sync_venues()
        except Exception as e:  # 지점 정보는 실패해도 공연 동기화는 계속
            print(f"지점 정보 갱신 건너뜀: {e}", file=sys.stderr)
    ids = list_ids(args.full)
    print(f"KOPIS 후보 {len(ids)}건 ({'전체' if args.full else '변경분'})")
    return sync(ids, detail, args.full, args.no_hold, download=True)


if __name__ == "__main__":
    sys.exit(main())

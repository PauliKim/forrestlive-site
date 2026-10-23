"""KOPIS 응답 예시로 sync_kopis.py를 확인한다. 실행: python3 tests/test_sync.py (네트워크 불필요)"""
import json, os, shutil, sys, tempfile
from datetime import date, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import sync_kopis as k

# 31일 창: 어느 창도 31일을 넘지 않고 빈틈이 없어야 한다
ws = list(k.windows(date(2026, 1, 1), date(2026, 12, 31)))
assert all((b - a).days <= 30 for a, b in ws) and ws[0][0] == date(2026, 1, 1) and ws[-1][1] == date(2026, 12, 31)
assert all(ws[i + 1][0] == ws[i][1] + timedelta(days=1) for i in range(len(ws) - 1))

now = k.now_kst(); fmt = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
def det(pid, name, frm, fc, upd, times="토요일(18:00)", cast="", relates=()):
    rel = "".join(f"<relate><relatenm>{n}</relatenm><relateurl>{u}</relateurl></relate>" for n, u in relates)
    return f"""<dbs><db><mt20id>{pid}</mt20id><prfnm>{name}</prfnm><prfpdfrom>{frm}</prfpdfrom><prfpdto>{frm}</prfpdto>
<fcltynm>숲세권 라이브</fcltynm><mt10id>{fc}</mt10id><prfcast>{cast}</prfcast><prfruntime>1시간 30분</prfruntime><prfage>만 7세 이상</prfage>
<pcseguidance>현장판매 50,000원&lt;br /&gt;사전예약 44,000원</pcseguidance><poster>http://www.kopis.or.kr/upload/pfmPoster/PF_{pid}_1.jpg</poster>
<sty>[공연소개] 작은 숲의 공연</sty><dtguidance>{times}</dtguidance><entrpsnmH>숲세권 라이브</entrpsnmH><updatedate>{upd}</updatedate>
<styurls><styurl>http://www.kopis.or.kr/upload/pfmIntroImage/PF_{pid}_a.jpg</styurl></styurls><relates>{rel}</relates></db></dbs>"""
DET = {
 "PF303815": det("PF303815", "숲세권 라이브, 박준일 단독 공연: 은방울꽃", "2026.10.30", "FC005062", fmt(now - timedelta(hours=2)), "금요일(20:00)", "박준일", [("멜론티켓", "https://ticket.melon.com/performance/index.htm?prodId=214092")]),
 "PF900001": det("PF900001", "숲세권 라이브, 테스트밴드 단독 공연: 수국", "2026.12.05", "FC003092", fmt(now - timedelta(minutes=20)), "토요일(15:00,19:00)", "가, 나",
                 [("멜론티켓", "https://ticket.melon.com/performance/index.htm?prodId=300001"), ("네이버N예약", "https://booking.naver.com/booking/12/bizes/1535586")]),
 "PF900002": det("PF900002", "숲세권 라이브, 방금밴드 단독 공연: 동백", "2026.12.06", "FC003092", fmt(now - timedelta(minutes=5))),
 "PF900003": det("PF900003", "먼데이프로젝트X숲세권 MONDAY: SOOP, 월요일밴드 단독 콘서트", "2026.12.07", "FC003092", fmt(now - timedelta(minutes=30)), "월요일(20:00)"),
}
LIST = "<dbs>" + "".join(f"<db><mt20id>{i}</mt20id></db>" for i in DET) + "</dbs>"
def fake_fetch(url, retries=3):
    path = url.split("?")[0].rsplit("/", 1)[-1]
    if path in DET: return DET[path].encode()
    return (LIST if "2026-12" in "" or "stdate=2026" in url else "<dbs></dbs>").encode()
# 방화벽 차단(HTTP 400 "Request Blocked"): 오래 기다리며 다시 시도하고, 계속 막히면 Blocked를 낸다
import io, urllib.error
real_fetch, real_urlopen, real_sleep = k.fetch, k.urllib.request.urlopen, k.time.sleep
waits, calls = [], []
def blocked_urlopen(req, timeout=30):
    calls.append(1)
    if len(calls) < 3:
        raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b"<H1>Request Blocked</H1>"))
    return io.BytesIO(b"<dbs></dbs>")
k.urllib.request.urlopen, k.time.sleep = blocked_urlopen, waits.append
assert real_fetch("https://example.test/x") == b"<dbs></dbs>" and waits[:2] == [15, 30], "차단은 길게 기다렸다 재시도"
k.urllib.request.urlopen = lambda req, timeout=30: (_ for _ in ()).throw(urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b"Request Blocked")))
try:
    real_fetch("https://example.test/x"); assert False
except k.Blocked:
    pass
def always_blocked(url, retries=3): raise k.Blocked("요청 실패: 차단")
k.fetch = always_blocked
os.environ["KOPIS_API_KEY"] = "0" * 32
sys.argv = ["sync_kopis.py"]
assert k.main() == 0, "변경분 확인은 차단되면 건너뛴다"
sys.argv = ["sync_kopis.py", "--full"]
k.sync_venues = lambda: None
try:
    k.main(); assert False, "전체 동기화는 차단되면 실패로 알린다"
except k.Blocked:
    pass
k.urllib.request.urlopen, k.time.sleep = real_urlopen, real_sleep

k.fetch = fake_fetch
os.environ["KOPIS_API_KEY"] = "test"

tmp = Path(tempfile.mkdtemp()); (tmp / "data").mkdir()
shutil.copy(k.DATA, tmp / "data/shows.json")
k.DATA, k.OVERRIDES, k.POSTERS, k.VENUES_FILE = tmp / "data/shows.json", tmp / "data/overrides.json", tmp / "assets/posters", tmp / "data/venues.json"
(tmp / "data/overrides.json").write_text(json.dumps({"shows": {"PF900001": {"openAt": "2026-11-20T20:00"}}}))
ids = list(DET)
assert k.sync(ids, k.detail, full=False, no_hold=False, download=False) == 0
shows = json.loads(k.DATA.read_text())["shows"]
by = {s.get("kopisId"): s for s in shows if s.get("kopisId")}
assert by["PF303815"]["title"] == "은방울꽃" and by["PF303815"]["id"] == "pf303815", "기존 공연 유지"
n = by["PF900001"]
assert n["title"] == "수국" and n["artist"] == "테스트밴드" and n["series"] == "숲세권 라이브"
assert n["time"] == "15:00" and n["timeNote"] == "오후 3시 · 오후 7시"
assert [t["site"] for t in n["tickets"]] == ["멜론티켓", "네이버 예약"], "예매처 여러 곳"
assert n["price"] == "현장판매 50,000원, 사전예약 44,000원" and n["intro"] == "작은 숲의 공연"
assert n["poster"].startswith("https://") and n["introImages"][0].startswith("https://"), "https 주소"
assert n["openAt"] == "2026-11-20T20:00", "overrides 반영"
assert "PF900002" not in by, "수정 15분 미만은 대기"
assert by["PF900003"]["title"] == "월요일밴드" and by["PF900003"]["series"] == "MONDAY:SOOP"
count = len(shows)
assert k.sync(ids, k.detail, full=False, no_hold=False, download=False) == 0
assert len(json.loads(k.DATA.read_text())["shows"]) == count, "다시 실행해도 중복 없음"
print("통과: 31일 창, 기존 공연 연결, 새 공연 추가, 예매처 여러 곳, 15분 대기, MONDAY:SOOP, overrides, 중복 없음, 방화벽 차단 처리")

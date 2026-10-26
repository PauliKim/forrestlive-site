"""고정 문구 점검(네트워크 없음): python3 tests/test_copy.py

- data/copy.json과 data/copy-schema.json의 번호가 같은지
- index.html이 copy.json 문구와 같은지(scripts/apply_copy.py --check)
- index.html·app.js에 쓰인 번호가 모두 목록에 있고, 목록의 번호가 모두 화면 어딘가에 쓰이는지
- 문구 안의 자리표시({n} 등)가 목록에 정의된 것인지
- 줄바꿈·따옴표·태그가 HTML에 안전하게 들어가는지
- SEO 덩어리(data/seo.json → index.html)가 들어 있는지, robots.txt·sitemap.xml·로고 파일
- (macOS) 서버 JS(functions/_lib/seo.js, copy.js)가 파이썬과 같은 결과인지, 서버 검사가 잘못된 값을 막는지
"""
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("apply_copy", ROOT / "scripts/apply_copy.py")
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)

schema = json.loads((ROOT / "data/copy-schema.json").read_text())
items = json.loads((ROOT / "data/copy.json").read_text())["items"]
defs = {i["id"]: i for g in schema["groups"] for i in g["items"]}
page = (ROOT / "index.html").read_text()
script = (ROOT / "app.js").read_text()
ok = []


def check(name, cond, detail=""):
    if not cond:
        sys.exit(f"실패: {name} {detail}")
    ok.append(name)


check("번호 일치", set(defs) == set(items), f"{set(defs) ^ set(items)}")
after, _ = ac.apply(page, items)
check("index.html 문구 일치", after == page, "python3 scripts/apply_copy.py 를 실행하세요")

used = set(re.findall(r'data-copy(?:-dyn)?="([A-Z]-\d+)"', page))
used |= set(re.findall(r'"([A-Z]-\d{2})"', script))
check("화면의 번호가 목록에 있음", used <= set(defs), f"{sorted(used - set(defs))}")
check("목록의 번호가 화면에 쓰임", set(defs) <= used, f"{sorted(set(defs) - used)}")

for k, v in items.items():
    for name in re.findall(r"\{(\w+)\}", v):
        check(f"{k} 자리표시", name in (defs[k].get("vars") or {}), f"{{{name}}}")

sample = {"B-06": '첫 줄\n"따옴표" <b>태그</b> & \'작은\'', "A-02": "설명\n줄"}
out, _ = ac.apply(page, sample)
check("줄바꿈과 이스케이프", '첫 줄<br>&quot;따옴표&quot; &lt;b&gt;태그&lt;/b&gt; &amp; &#x27;작은&#x27;' in out)
check("meta 줄바꿈은 띄어쓰기로", 'data-copy="A-02" content="설명 줄"' in out)

# SEO 덩어리와 검색엔진용 파일
seo_now = json.loads((ROOT / "data/seo.json").read_text())
check("SEO 덩어리 들어 있음", ac.seo_block(seo_now) in page)
check("SEO 공유 이미지 파일", (ROOT / seo_now["ogImage"]).is_file(), seo_now["ogImage"])
check("구조화 데이터 로고 파일", (ROOT / "assets/logo/logo-512.png").is_file())
check("robots.txt 사이트맵", f"Sitemap: {ac.SITE}sitemap.xml" in (ROOT / "robots.txt").read_text())
check("sitemap.xml 주소", f"<loc>{ac.SITE}</loc>" in (ROOT / "sitemap.xml").read_text())
seo_cases = [seo_now, {**seo_now, "index": False, "verification": {"google": "abc_DEF-123=", "naver": "0123abcd", "bing": "ABCDEF"},
                       "organization": {"name": '숲 "세권" </script> & Co', "alternateName": "For:Rest 'LIVE'", "sameAs": ["https://www.instagram.com/x", "https://x.com/y"]}}]
check("SEO 덩어리 </script> 막음", "</script> &" not in ac.seo_block(seo_cases[1]))

# 서버 쪽 JavaScript(맥에 기본으로 있는 osascript로 실행)
if shutil.which("osascript"):
    def js(source):
        r = subprocess.run(["osascript", "-l", "JavaScript", "-e", source], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"실패: JavaScript 실행 {r.stderr}")
        return r.stdout.strip()

    def module(path):
        return re.sub(r"^export ", "", (ROOT / path).read_text(), flags=re.M).replace("import ", "// import ")

    lib = module("functions/_lib/copy.js")
    expected, _ = ac.apply(page, {**items, **sample})
    got = js(lib + f"\nfunction run() {{ return applyCopy({json.dumps(page)}, {json.dumps({**items, **sample})}); }} run();")
    check("서버 applyCopy가 파이썬과 같음", got == expected.strip())

    seo_lib = lib + "\n" + module("functions/_lib/seo.js")
    for i, case in enumerate(seo_cases):
        got = js(seo_lib + f"\nfunction run() {{ const r = normalizeSeo({json.dumps(case)}); return JSON.stringify([r.errors, seoBlock(r.seo)]); }} run();")
        errs, block = json.loads(got)
        check(f"SEO 덩어리 {i} 서버가 파이썬과 같음", not errs and block == ac.seo_block(case), f"{errs} {block}")
    got = js(seo_lib + f"\nfunction run() {{ return applySeo({json.dumps(page)}, normalizeSeo({json.dumps(seo_now)}).seo); }} run();")
    check("서버 applySeo가 지금 페이지와 같음", got == page.strip())
    bad = {**seo_now, "ogImage": "../secret.jpg", "verification": {"google": '<meta name="x" content="a b">'}, "organization": {"name": "", "sameAs": ["http://insecure"]}}
    got = json.loads(js(seo_lib + f"\nJSON.stringify(normalizeSeo({json.dumps(bad)}).errors);"))
    check("SEO 서버 검사가 잘못된 값을 막음", len(got) >= 4, str(got))
    got = js(seo_lib + '\nverificationCode(\'<meta name="google-site-verification" content="AbC_123" />\');')
    check("소유 확인 태그를 통째로 넣어도 코드만", got == "AbC_123", got)

print("통과: " + ", ".join(ok[:6]) + f" 외 {len(ok) - 6}개")

"""data/copy.json의 고정 문구를 index.html에 써 넣는다.

어드민(/admin)에서 저장하면 서버(functions/api/copy.js)가 같은 일을 해서 함께 커밋한다.
SEO 설정(data/seo.json)도 index.html의 <!-- seo:start --> ~ <!-- seo:end --> 사이에 넣는다(어드민 SEO 설정은 functions/api/seo.js).
copy.json이나 seo.json을 손으로 고쳤을 때만 실행한다:  python3 scripts/apply_copy.py
--check 를 붙이면 바꾸지 않고, 맞지 않는 곳이 있으면 실패로 끝난다(tests에서 쓴다).

index.html 쪽 약속
- 글자 요소: <태그 ... data-copy="B-06">문구</태그>  (안에는 글자와 <br>만)
- meta 요소: <meta ... data-copy="A-02" content="문구">
- 줄바꿈(\\n)은 <br>로 쓴다.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ELEMENT = re.compile(r'(<(\w+)\b[^>]*\bdata-copy="([A-Z]-\d+)"[^>]*>)((?:[^<]|<br>)*)(</\2>)')
META = re.compile(r'(<meta\b[^>]*\bdata-copy="([A-Z]-\d+)"[^>]*\bcontent=")([^"]*)(")')
SITE = "https://concert.forrestlive.com/"
SEO_BLOCK = re.compile(r"<!-- seo:start.*?<!-- seo:end -->", re.S)
SEO_VERIFY = [("google", "google-site-verification"), ("naver", "naver-site-verification"), ("bing", "msvalidate.01")]


def to_html(text):
    return "<br>".join(html.escape(line, quote=True) for line in text.split("\n"))


def apply(page, items):
    """index.html 문자열에 문구를 넣고, (새 문자열, 쓰인 번호 집합)을 돌려준다."""
    used = set()

    def element(m):
        key = m.group(3)
        if key not in items:
            return m.group(0)
        used.add(key)
        return m.group(1) + to_html(items[key]) + m.group(5)

    def meta(m):
        key = m.group(2)
        if key not in items:
            return m.group(0)
        used.add(key)
        return m.group(1) + html.escape(items[key].replace("\n", " "), quote=True) + m.group(4)

    page = ELEMENT.sub(element, page)
    page = META.sub(meta, page)
    return page, used


def seo_block(seo):
    """data/seo.json → <head>에 넣을 덩어리. functions/_lib/seo.js의 seoBlock과 같은 결과"""
    image = SITE + seo["ogImage"]
    esc = lambda v: html.escape(str(v), quote=True)
    lines = [
        "<!-- seo:start 자동 생성: data/seo.json(어드민 SEO 설정). 직접 고치지 않는다 -->",
        f'<meta property="og:image" content="{esc(image)}">',
        f'<meta property="og:image:width" content="{seo["ogImageWidth"]}">',
        f'<meta property="og:image:height" content="{seo["ogImageHeight"]}">',
        f'<meta name="twitter:image" content="{esc(image)}">',
    ]
    if seo.get("index") is False:
        lines.append('<meta name="robots" content="noindex, nofollow">')
    for key, name in SEO_VERIFY:
        if seo["verification"].get(key):
            lines.append(f'<meta name="{name}" content="{esc(seo["verification"][key])}">')
    org = seo["organization"]
    data = {"@context": "https://schema.org", "@type": "Organization", "name": org["name"]}
    if org.get("alternateName"):
        data["alternateName"] = org["alternateName"]
    data["url"] = SITE
    data["logo"] = SITE + "assets/logo/logo-512.png"
    if org.get("sameAs"):
        data["sameAs"] = org["sameAs"]
    ld = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    lines += [f'<script type="application/ld+json">{ld}</script>', "<!-- seo:end -->"]
    return "\n".join(lines)


def apply_seo(page, seo):
    if not SEO_BLOCK.search(page):
        sys.exit("index.html에 <!-- seo:start --> ~ <!-- seo:end --> 자리가 없습니다.")
    block = seo_block(seo)
    return SEO_BLOCK.sub(lambda m: block, page, count=1)


def load_seo():
    return json.loads((ROOT / "data" / "seo.json").read_text())


def main():
    check = "--check" in sys.argv
    items = json.loads((ROOT / "data/copy.json").read_text())["items"]
    path = ROOT / "index.html"
    before = path.read_text()
    after, used = apply(before, items)
    after = apply_seo(after, load_seo())
    tagged = set(re.findall(r'data-copy="([A-Z]-\d+)"', before))
    missing = sorted(tagged - used)
    if missing:
        sys.exit(f"index.html에서 문구를 넣지 못한 번호: {', '.join(missing)} (요소 안에 다른 태그가 있는지 확인)")
    if check:
        if after != before:
            sys.exit("index.html의 문구나 SEO 덩어리가 data/copy.json·data/seo.json과 다릅니다. python3 scripts/apply_copy.py 를 실행하세요.")
        print(f"문구 일치: {len(used)}개 번호")
        return
    if after != before:
        path.write_text(after)
        print(f"index.html에 문구와 SEO 설정을 반영했습니다 ({len(used)}개 번호).")
    else:
        print("바뀐 문구가 없습니다.")


if __name__ == "__main__":
    main()

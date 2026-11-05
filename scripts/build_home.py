"""data/home-copy.json의 문구를 scripts/home.template.html에 넣어 소개 페이지 세 개를 만든다.

  home/index.html (한국어)  home/en/index.html (영어)  home/ja/index.html (일본어)

문구나 틀을 고친 뒤 실행한다:  python3 scripts/build_home.py
--check 를 붙이면 바꾸지 않고, 맞지 않는 곳이 있으면 실패로 끝난다(tests에서 쓴다).

틀의 약속
- {{문구키}}   글자로 넣는다. 줄바꿈(\\n)은 <br>로 바꾼다.
- {{=문구키}}  속성값으로 넣는다. 줄바꿈은 빈칸으로 바꾼다.
- {{@lang}} {{@path}} {{@cur-ko}} 같은 @값은 언어마다 스크립트가 정한다.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "scripts/home.template.html"
COPY = ROOT / "data/home-copy.json"
SITE = "https://forrestlive.com"
PAGES = {"ko": ("home/index.html", "/"), "en": ("home/en/index.html", "/en"), "ja": ("home/ja/index.html", "/ja")}
TOKEN = re.compile(r"\{\{([=@]?)([\w.-]+)\}\}")


def render(template, items, lang):
    path = PAGES[lang][1]
    values = {"lang": lang, "path": path, "url": SITE + path}
    for code in PAGES:
        values[f"cur-{code}"] = ' aria-current="page"' if code == lang else ""

    def fill(m):
        kind, key = m.group(1), m.group(2)
        if kind == "@":
            return values[key]
        text = items[key][lang]
        if kind == "=":
            return html.escape(text.replace("\n", " "), quote=True)
        return "<br>".join(html.escape(line, quote=False) for line in text.split("\n"))

    return TOKEN.sub(fill, template)


def build():
    """{파일 경로: 내용}을 돌려준다."""
    template = TEMPLATE.read_text(encoding="utf-8")
    items = json.loads(COPY.read_text(encoding="utf-8"))["items"]
    return {ROOT / PAGES[lang][0]: render(template, items, lang) for lang in PAGES}


def main():
    pages = build()
    if "--check" in sys.argv:
        stale = [str(p.relative_to(ROOT)) for p, text in pages.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            sys.exit("다시 만들어야 합니다: " + ", ".join(stale))
        return
    for path, text in pages.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()

"""data/home-copy.json의 문구와 data/home-media.json의 그림·링크를 scripts/home.template.html에 넣어 소개 페이지 세 개를 만든다.

  home/index.html (한국어)  home/en/index.html (영어)  home/ja/index.html (일본어)

문구, 그림, 틀을 손으로 고친 뒤 실행한다(어드민 저장은 서버가 같은 일을 한다. home/render.js와 결과가 같아야 한다):  python3 scripts/build_home.py
--check 를 붙이면 바꾸지 않고, 맞지 않는 곳이 있으면 실패로 끝난다(tests에서 쓴다).

틀의 약속
- {{문구키}}   글자로 넣는다. 줄바꿈(\\n)은 <br>로 바꾼다.
- {{=문구키}}  속성값으로 넣는다. 줄바꿈은 빈칸으로 바꾼다.
- {{@lang}} {{@path}} {{@locale}} {{@cur-ko}} 같은 @값은 언어마다 스크립트가 정한다.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "scripts/home.template.html"
COPY = ROOT / "data/home-copy.json"
MEDIA = ROOT / "data/home-media.json"
# 언어별 (파일, 경로, og:locale)
SITE = "https://forrestlive.com"
PAGES = {
    "ko": ("home/index.html", "/", "ko_KR"),
    "en": ("home/en/index.html", "/en/", "en_US"),
    "ja": ("home/ja/index.html", "/ja/", "ja_JP"),
}
esc = lambda text: html.escape(text, quote=True)
TOKEN = re.compile(r"\{\{([=@]?)([\w.-]+)\}\}")


def render(template, items, media, lang):
    path = PAGES[lang][1]
    values = {"lang": lang, "path": path, "url": SITE + path, "locale": PAGES[lang][2], "ogImage": esc("/" + media["ogImage"])}
    for card, value in media["cards"].items():
        values[f"card.{card}.image"] = esc("/" + value["image"])
        values[f"card.{card}.url"] = esc(value["url"])
    alt = esc(items["philosophy.photo"][lang].replace("\n", " "))
    values["artists"] = "\n".join(f'        <li><img src="{esc("/" + a["image"])}" alt="{alt}" loading="lazy"></li>' for a in media["artists"])
    for code in PAGES:
        values[f"cur-{code}"] = ' aria-current="page"' if code == lang else ""

    def fill(m):
        kind, key = m.group(1), m.group(2)
        if kind == "@":
            return values[key]
        text = items[key][lang]
        if kind == "=":
            return esc(text.replace("\n", " "))
        return "<br>".join(html.escape(line, quote=False) for line in text.split("\n"))

    return TOKEN.sub(fill, template)


def build():
    """{파일 경로: 내용}을 돌려준다."""
    template = TEMPLATE.read_text(encoding="utf-8")
    items = json.loads(COPY.read_text(encoding="utf-8"))["items"]
    media = json.loads(MEDIA.read_text(encoding="utf-8"))
    return {ROOT / PAGES[lang][0]: render(template, items, media, lang) for lang in PAGES}


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

"""data/copy.json의 고정 문구를 index.html에 써 넣는다.

어드민(/admin)에서 저장하면 서버(functions/api/copy.js)가 같은 일을 해서 함께 커밋한다.
copy.json을 손으로 고쳤을 때만 실행한다:  python3 scripts/apply_copy.py
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


def main():
    check = "--check" in sys.argv
    items = json.loads((ROOT / "data/copy.json").read_text())["items"]
    path = ROOT / "index.html"
    before = path.read_text()
    after, used = apply(before, items)
    tagged = set(re.findall(r'data-copy="([A-Z]-\d+)"', before))
    missing = sorted(tagged - used)
    if missing:
        sys.exit(f"index.html에서 문구를 넣지 못한 번호: {', '.join(missing)} (요소 안에 다른 태그가 있는지 확인)")
    if check:
        if after != before:
            sys.exit("index.html의 문구가 data/copy.json과 다릅니다. python3 scripts/apply_copy.py 를 실행하세요.")
        print(f"문구 일치: {len(used)}개 번호")
        return
    if after != before:
        path.write_text(after)
        print(f"index.html에 문구를 반영했습니다 ({len(used)}개 번호).")
    else:
        print("바뀐 문구가 없습니다.")


if __name__ == "__main__":
    main()

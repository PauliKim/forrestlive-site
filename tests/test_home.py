"""forrestlive.com 소개 페이지 점검. 네트워크 없이 돈다:  python3 tests/test_home.py"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ("ko", "en", "ja")


def main():
    items = json.loads((ROOT / "data/home-copy.json").read_text(encoding="utf-8"))["items"]
    template = (ROOT / "scripts/home.template.html").read_text(encoding="utf-8")

    # 모든 문구에 세 언어가 다 있다
    for key, value in items.items():
        for lang in LANGS:
            assert value.get(lang, "").strip(), f"{key}: {lang} 문구가 비어 있습니다"

    # 틀이 쓰는 문구와 문구 파일이 서로 맞는다
    used = {m.group(2) for m in re.finditer(r"\{\{([=]?)([\w.-]+)\}\}", template)}
    assert not used - set(items), f"문구 파일에 없는 키: {sorted(used - set(items))}"
    assert not set(items) - used, f"틀에서 쓰지 않는 키: {sorted(set(items) - used)}"

    # 만들어 둔 페이지가 지금 문구와 같다
    subprocess.run([sys.executable, str(ROOT / "scripts/build_home.py"), "--check"], check=True)

    # 페이지가 가리키는 파일이 모두 있다
    page = (ROOT / "home/index.html").read_text(encoding="utf-8")
    assert "{{" not in page, "채워지지 않은 자리가 남았습니다"
    for path in set(re.findall(r'(?:src|href)="(/[\w./-]+\.\w+)"', page)) | set(re.findall(r'(/[\w/-]+\.(?:jpg|png)) \d+w', page)):
        assert (ROOT / path.lstrip("/")).exists(), f"없는 파일: {path}"
    assert 'mailto:eddie@pondmakers.com' in page

    # 주소 분기: 함수가 돌아야 하는 경로가 _routes.json에 모두 있다
    routes = json.loads((ROOT / "_routes.json").read_text(encoding="utf-8"))["include"]
    for path in ("/", "/en", "/ja", "/ko", "/robots.txt", "/sitemap.xml", "/concert", "/concert/*", "/api/*"):
        assert path in routes, f"_routes.json에 없는 경로: {path}"
    assert (ROOT / "home/robots.txt").exists() and (ROOT / "home/sitemap.xml").exists()

    print("소개 페이지 점검 통과")


if __name__ == "__main__":
    main()

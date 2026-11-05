"""forrestlive.com 소개 페이지 점검. 네트워크 없이 돈다:  python3 tests/test_home.py"""
import json
import re
import shutil
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
    unused = set(items) - used - {"philosophy.photo"}  # 포스터 설명은 포스터 목록을 만들 때 쓴다
    assert not unused, f"틀에서 쓰지 않는 키: {sorted(unused)}"

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
    for path in ("/", "/index.html", "/en", "/en/", "/ja", "/ja/", "/ko", "/robots.txt", "/sitemap.xml", "/concert", "/concert/*", "/api/*"):
        assert path in routes, f"_routes.json에 없는 경로: {path}"
    assert (ROOT / "home/robots.txt").exists() and (ROOT / "home/sitemap.xml").exists()

    # 세 페이지가 같은 언어 정보를 갖는다
    for lang, path, locale in (("ko", "home/index.html", "ko_KR"), ("en", "home/en/index.html", "en_US"), ("ja", "home/ja/index.html", "ja_JP")):
        text = (ROOT / path).read_text(encoding="utf-8")
        assert f'<html lang="{lang}" data-lang="{lang}">' in text, path
        assert f'content="{locale}"' in text, path
        assert 'hreflang="x-default" href="https://forrestlive.com/en/"' in text, path
        assert text.count("data-lang-link=") == 3, path
    for path in ("home/en/index.html", "home/ja/index.html"):
        assert (ROOT / path).read_text(encoding="utf-8").count('rel="canonical"') == 1, path

    # 언어 이동 규칙(functions/_lib/lang.js). 맥에 기본으로 있는 osascript로 실행
    if shutil.which("osascript"):
        lib = (ROOT / "functions/_lib/lang.js").read_text(encoding="utf-8").replace("export ", "")
        cases = [
            ({"country": "KR"}, None),
            ({"country": "JP"}, "/ja/"),
            ({"country": "US"}, "/en/"),
            ({"country": None}, "/en/"),
            ({"country": "US", "search": "?a=1"}, "/en/?a=1"),
            ({"country": "US", "cookie": "x=1; lang=ko"}, None),
            ({"country": "KR", "cookie": "lang=ja"}, "/ja/"),
            ({"country": "US", "pathname": "/en/"}, None),
            ({"country": "JP", "pathname": "/en/"}, None),
            ({"country": "US", "method": "POST"}, None),
            ({"country": "US", "search": "?preview=1"}, None),
            ({"country": "US", "userAgent": "Mozilla/5.0 (compatible; Googlebot/2.1)"}, None),
            ({"country": "US", "userAgent": "facebookexternalhit/1.1"}, None),
        ]
        for case, want in cases:
            args = {"method": "GET", "pathname": "/", "search": "", "country": None, "cookie": "", "userAgent": "Mozilla/5.0", **case}
            source = lib + f"\nJSON.stringify(redirectTarget({json.dumps(args)}));"
            run = subprocess.run(["osascript", "-l", "JavaScript", "-e", source], capture_output=True, text=True)
            assert run.returncode == 0, run.stderr
            assert json.loads(run.stdout) == want, f"{case}: {run.stdout.strip()}"
    else:
        print("(osascript가 없어 언어 이동 점검은 건너뜀)")

    # 어드민 문구 목록과 문구 파일이 맞는다
    schema = json.loads((ROOT / "data/home-copy-schema.json").read_text(encoding="utf-8"))
    listed = [item["id"] for group in schema["groups"] for item in group["items"]]
    assert sorted(listed) == sorted(items), "data/home-copy-schema.json과 문구 파일의 항목이 다릅니다"

    # 그림·링크가 모두 있고, 카드 링크는 유튜브다
    media = json.loads((ROOT / "data/home-media.json").read_text(encoding="utf-8"))
    for path in [media["ogImage"], *(c["image"] for c in media["cards"].values()), *(a["image"] for a in media["artists"])]:
        assert (ROOT / path).exists(), f"없는 그림: {path}"
    assert len(media["cards"]) == 4 and media["artists"]

    if shutil.which("osascript"):
        def js(source):
            run = subprocess.run(["osascript", "-l", "JavaScript", "-e", source], capture_output=True, text=True)
            assert run.returncode == 0, run.stderr
            return json.loads(run.stdout)

        strip = lambda text: re.sub(r"^import .*$", "", text, flags=re.M).replace("export ", "")
        render = strip((ROOT / "home/render.js").read_text(encoding="utf-8"))
        lib = strip((ROOT / "functions/_lib/home.js").read_text(encoding="utf-8"))

        # 서버가 만드는 페이지와 scripts/build_home.py가 만드는 페이지가 같다
        args = f"{json.dumps(template)}, {json.dumps(items)}, {json.dumps(media)}"
        pages = js(render + f"\nJSON.stringify(buildPages({args}));")
        for page in pages:
            assert page["text"] == (ROOT / page["path"]).read_text(encoding="utf-8"), f"서버 결과가 다릅니다: {page['path']}"

        # 저장 요청 검사
        def errors(change, uploads=None):
            next_media = json.loads(json.dumps(media))
            change(next_media)
            return js(lib + f"\nJSON.stringify(validateMedia({json.dumps(next_media)}, {json.dumps(media)}, {json.dumps(uploads or {})}));")

        jpeg = "/9j/AAAA"
        assert errors(lambda m: None) == []
        assert errors(lambda m: m["cards"]["partners.kcc"].update(url="https://youtu.be/abc")) == []
        assert errors(lambda m: m["cards"]["partners.kcc"].update(url="https://evil.example/x"))
        assert errors(lambda m: m["cards"]["partners.kcc"].update(url="javascript:alert(1)"))
        assert errors(lambda m: m["artists"].clear())
        assert errors(lambda m: m["artists"].append({"image": "new:1"}), {"new:1": jpeg}) == []
        assert errors(lambda m: m["artists"].append({"image": "new:1"}), {"new:1": "not-a-jpeg"})
        assert errors(lambda m: m["artists"].append({"image": "new:2"}), {"new:1": jpeg})
        assert errors(lambda m: m["artists"].append({"image": "assets/fonts/x.jpg"}))
        assert errors(lambda m: m["artists"].append({"image": "../../index.html"}))

        resolved = js(lib + f"""
const r = resolveMedia({json.dumps({**media, "artists": [{"image": "new:1"}]})}, {{"new:1": "{jpeg}"}}, "20261105-000000");
JSON.stringify([r.media.artists[0].image, r.files]);""")
        assert resolved == ["assets/home/upload-20261105-000000-1.jpg", [{"path": "assets/home/upload-20261105-000000-1.jpg", "base64": jpeg}]]

        broken = {**items, "hero.title": {**items["hero.title"], "en": " "}}
        assert js(lib + f"\nJSON.stringify(validateItems({json.dumps(broken)}, {json.dumps(items)}));")
        assert js(lib + f"\nJSON.stringify(validateItems({json.dumps(items)}, {json.dumps(items)}));") == []

    print("소개 페이지 점검 통과")


if __name__ == "__main__":
    main()

"""고정 문구 점검(네트워크 없음): python3 tests/test_copy.py

- data/copy.json과 data/copy-schema.json의 번호가 같은지
- index.html이 copy.json 문구와 같은지(scripts/apply_copy.py --check)
- index.html·app.js에 쓰인 번호가 모두 목록에 있고, 목록의 번호가 모두 화면 어딘가에 쓰이는지
- 문구 안의 자리표시({n} 등)가 목록에 정의된 것인지
- 줄바꿈·따옴표·태그가 HTML에 안전하게 들어가는지
"""
import importlib.util
import json
import re
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

print("통과: " + ", ".join(ok[:6]) + f" 외 {len(ok) - 6}개")

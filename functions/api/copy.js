// 문구 저장 서버 (Cloudflare Pages Function)
//   GET  /api/copy  → 지금 main에 있는 문구와 버전(sha), 로그인한 이메일
//   POST /api/copy  → { items, sha } 를 받아 data/copy.json과 index.html을 main에 커밋
// 로그인 확인과 GitHub 읽기·쓰기는 ../_lib/server.js(필요한 환경 변수도 거기 적어 둠).
import { applyCopy, validateItems } from "../_lib/copy.js";
import { json, signedInEmail, getFile, putFile } from "../_lib/server.js";

const COPY_PATH = "data/copy.json";

export async function onRequestGet({ request, env }) {
  try {
    const email = await signedInEmail(request, env);
    const file = await getFile(env, COPY_PATH);
    return json({ email, sha: file.sha, copy: JSON.parse(file.text) });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const email = await signedInEmail(request, env);
    const { items, sha } = await request.json();
    const current = await getFile(env, COPY_PATH);
    if (sha !== current.sha) return json({ error: "다른 곳에서 문구가 먼저 저장되었습니다. 새로고침해서 최신 문구를 불러온 뒤 다시 고쳐 주세요." }, 409);
    const copy = JSON.parse(current.text);
    const schema = await env.ASSETS.fetch(new URL("/data/copy-schema.json", request.url)).then((r) => r.json());
    const errors = validateItems(items, schema, copy.items);
    if (errors.length) return json({ error: "저장하지 못했습니다.", details: errors }, 400);

    const changed = Object.keys(items).filter((k) => items[k] !== copy.items[k]);
    if (!changed.length) return json({ ok: true, sha: current.sha, changed: [] });

    // data/copy.json 먼저, 그다음 같은 문구를 넣은 index.html
    const order = schema.groups.flatMap((g) => g.items.map((i) => i.id));
    const nextCopy = { ...copy, items: Object.fromEntries(order.map((id) => [id, items[id]])) };
    const message = `문구 수정: ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ` 외 ${changed.length - 6}개` : ""}\n\n어드민에서 ${email}이 저장`;
    const saved = await putFile(env, COPY_PATH, JSON.stringify(nextCopy, null, 1), current.sha, message);

    let htmlNote = "";
    try {
      const page = await getFile(env, "index.html");
      const next = applyCopy(page.text, nextCopy.items);
      if (next !== page.text) await putFile(env, "index.html", next, page.sha, `${message.split("\n")[0]} (index.html 반영)`);
    } catch (e) {
      htmlNote = `문구는 저장했지만 index.html 반영에 실패했습니다: ${e.message}. 화면에는 문구가 그대로 보이고, 검색·공유 미리보기만 늦게 바뀝니다.`;
    }
    return json({ ok: true, sha: saved.content.sha, changed, note: htmlNote });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}

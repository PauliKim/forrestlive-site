// 문구 저장 서버 (Cloudflare Pages Function)
//   GET  /api/copy  → 지금 main에 있는 문구와 버전(sha), 로그인한 이메일
//   POST /api/copy  → { items, sha } 를 받아 data/copy.json과 index.html을 main에 커밋
//
// 필요한 환경 변수(Cloudflare Pages 설정 → 환경 변수, 비밀값으로):
//   GITHUB_TOKEN        이 저장소의 Contents 읽기·쓰기만 허용한 fine-grained 토큰
//   ACCESS_TEAM_DOMAIN  Cloudflare Access 팀 주소, 예: forrestlive.cloudflareaccess.com
//   ACCESS_AUD          /admin Access 애플리케이션의 AUD 태그
// 선택: ADMIN_EMAILS (쉼표로 구분한 허용 이메일. Access 정책에 더해 한 번 더 확인)
// 하나라도 없으면 저장하지 않는다.
import { applyCopy, validateItems, verifyAccessToken, toBase64, fromBase64 } from "../_lib/copy.js";

const REPO = "PauliKim/forrestlive-site";
const BRANCH = "main";
const COPY_PATH = "data/copy.json";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function signedInEmail(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw Object.assign(new Error("로그인 설정(ACCESS_TEAM_DOMAIN, ACCESS_AUD)이 아직 없습니다."), { status: 503 });
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get("cf-access-jwt-assertion") || (cookie && cookie[1]);
  const certs = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } }).then((r) => r.json());
  try {
    const email = await verifyAccessToken(token, { keys: certs.keys || [], aud: env.ACCESS_AUD, issuer: `https://${team}` });
    const allow = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes(email.toLowerCase())) throw new Error(`${email}은 문구를 고칠 수 없는 계정입니다.`);
    return email;
  } catch (e) {
    throw Object.assign(e, { status: 401 });
  }
}

async function github(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw Object.assign(new Error("저장 설정(GITHUB_TOKEN)이 아직 없습니다."), { status: 503 });
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "forrestlive-admin",
      ...(init.body ? { "content-type": "application/json" } : {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}: ${body.message || "요청 실패"}`), { status: res.status === 409 ? 409 : 502, github: res.status });
  return body;
}

const getFile = async (env, path) => {
  const f = await github(env, `contents/${path}?ref=${BRANCH}`);
  return { sha: f.sha, text: fromBase64(f.content) };
};
const putFile = (env, path, text, sha, message) => github(env, `contents/${path}`, {
  method: "PUT",
  body: JSON.stringify({
    message, branch: BRANCH, sha, content: toBase64(text),
    committer: { name: "forrestlive-admin", email: "forrestlive-admin@users.noreply.github.com" }
  })
});

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

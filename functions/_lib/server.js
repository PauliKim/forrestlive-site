// 어드민 서버들(문구 저장, SEO 설정)이 함께 쓰는 것: JSON 응답, Access 로그인 확인, GitHub 파일 읽기·쓰기.
//
// 필요한 환경 변수(Cloudflare Pages 설정 → 환경 변수):
//   GITHUB_TOKEN        이 저장소의 Contents 읽기·쓰기만 허용한 fine-grained 토큰(Secret)
//   ACCESS_TEAM_DOMAIN  Cloudflare Access 팀 주소, 예: forrestlive.cloudflareaccess.com
//   ACCESS_AUD          /admin Access 애플리케이션의 AUD 태그
// 선택: ADMIN_EMAILS (쉼표로 구분한 허용 이메일. Access 정책에 더해 한 번 더 확인)
// 하나라도 없으면 저장하지 않는다.
import { verifyAccessToken, toBase64, fromBase64 } from "./copy.js";

export const REPO = "PauliKim/forrestlive-site";
export const BRANCH = "main";
const ADMIN = { name: "forrestlive-admin", email: "forrestlive-admin@users.noreply.github.com" }; // 어드민 저장 커밋 작성자

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export const fail = (message, status) => Object.assign(new Error(message), { status });

// Access가 넘겨준 로그인 토큰을 직접 검증하고 이메일을 돌려준다. 틀리면 status가 붙은 예외.
export async function signedInEmail(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw fail("로그인 설정(ACCESS_TEAM_DOMAIN, ACCESS_AUD)이 아직 없습니다.", 503);
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get("cf-access-jwt-assertion") || (cookie && cookie[1]);
  const certs = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } }).then((r) => r.json());
  try {
    const email = await verifyAccessToken(token, { keys: certs.keys || [], aud: env.ACCESS_AUD, issuer: `https://${team}` });
    const allow = (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes(email.toLowerCase())) throw new Error(`${email}은 고칠 수 없는 계정입니다.`);
    return email;
  } catch (e) {
    throw Object.assign(e, { status: 401 });
  }
}

async function github(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw fail("저장 설정(GITHUB_TOKEN)이 아직 없습니다.", 503);
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

// ref: 브랜치 이름이나 커밋 sha. 돌려주는 sha는 그 파일(blob)의 sha
export const getFile = async (env, path, ref = BRANCH) => {
  const f = await github(env, `contents/${path}?ref=${ref}`);
  return { sha: f.sha, text: fromBase64(f.content) };
};

export const putFile = (env, path, text, sha, message) => github(env, `contents/${path}`, {
  method: "PUT",
  body: JSON.stringify({
    message, branch: BRANCH, sha, content: toBase64(text),
    committer: ADMIN
  })
});

// 여러 파일을 커밋 하나로 main에 올린다(Git Data API).
// build(head)는 그 커밋(head) 기준으로 올릴 파일 목록 [{ path, text } | { path, base64 }]을 돌려준다.
// 그사이 main이 앞서 나가면(봇의 KOPIS 커밋 등) 새 head로 한 번 더 만들어 올린다. build가 던진 예외는 그대로 올라간다.
// 올릴 파일이 없으면 커밋하지 않고 null. message는 문자열이나 (files) => 문자열
export async function commitFiles(env, build, message) {
  for (let attempt = 0; ; attempt++) {
    const head = (await github(env, `git/ref/heads/${BRANCH}`)).object.sha;
    const files = await build(head);
    if (!files.length) return null;
    const base = (await github(env, `git/commits/${head}`)).tree.sha;
    const entries = [];
    for (const f of files) {
      const entry = { path: f.path, mode: "100644", type: "blob" };
      if (f.base64 != null) entry.sha = (await github(env, "git/blobs", { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) })).sha;
      else entry.content = f.text;
      entries.push(entry);
    }
    const tree = await github(env, "git/trees", { method: "POST", body: JSON.stringify({ base_tree: base, tree: entries }) });
    const commit = await github(env, "git/commits", { method: "POST", body: JSON.stringify({ message: typeof message === "function" ? message(files) : message, tree: tree.sha, parents: [head], author: ADMIN, committer: ADMIN }) });
    try {
      await github(env, `git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      return commit;
    } catch (e) {
      if (e.github !== 422 || attempt >= 1) throw e;
    }
  }
}

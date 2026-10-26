// SEO 설정 서버 (Cloudflare Pages Function, 어드민 /admin/seo.html에서 씀)
//   GET  /api/seo  → data/seo.json과 검색·공유 문구(A-01~A-04), 각 파일 버전(sha), 로그인한 이메일
//   POST /api/seo  → { seo, seoSha, text: { sha, items } | null, image } 를 받아
//                    data/seo.json, (바뀌었으면) data/copy.json, index.html, 새 공유 이미지를 커밋 하나로 main에 올린다.
// 로그인 확인은 문구 저장 서버와 같다(../_lib/server.js). GITHUB_TOKEN 필요.
import { applyCopy, validateItems } from "../_lib/copy.js";
import { normalizeSeo, applySeo } from "../_lib/seo.js";
import { json, fail, signedInEmail, getFile, commitFiles } from "../_lib/server.js";

const SEO_PATH = "data/seo.json";
const COPY_PATH = "data/copy.json";
const PAGE_PATH = "index.html";
const TEXT_IDS = ["A-01", "A-02", "A-03", "A-04"];
const OG = { width: 1200, height: 630 }; // 어드민이 올리는 공유 이미지 크기(브라우저에서 이 크기로 잘라 보낸다)
const pick = (items) => Object.fromEntries(TEXT_IDS.map((id) => [id, items[id] ?? ""]));

export async function onRequestGet({ request, env }) {
  try {
    const email = await signedInEmail(request, env);
    const [seoFile, copyFile] = await Promise.all([getFile(env, SEO_PATH), getFile(env, COPY_PATH)]);
    return json({ email, seoSha: seoFile.sha, seo: JSON.parse(seoFile.text), text: { sha: copyFile.sha, items: pick(JSON.parse(copyFile.text).items) } });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const email = await signedInEmail(request, env);
    const body = await request.json();
    const { seo, errors } = normalizeSeo(body.seo);

    let image = null;
    if (body.image != null) {
      const b64 = String(body.image);
      if (!/^\/9j\/[A-Za-z0-9+/=]+$/.test(b64) || b64.length > 2_800_000) errors.push("공유 이미지는 2MB 이하 JPG여야 합니다.");
      else {
        image = { path: `assets/seo/og-${stamp()}.jpg`, base64: b64 };
        Object.assign(seo, { ogImage: image.path, ogImageWidth: OG.width, ogImageHeight: OG.height });
      }
    }

    const text = body.text || null;
    if (text && (typeof text.items !== "object" || Object.keys(text.items).some((k) => !TEXT_IDS.includes(k)))) errors.push("문구 형식이 올바르지 않습니다.");
    if (errors.length) return json({ error: "저장하지 못했습니다.", details: errors }, 400);

    const schema = await env.ASSETS.fetch(new URL("/data/copy-schema.json", request.url)).then((r) => r.json());
    const notes = []; // 커밋 메시지에 쓸 바뀐 것들

    const commit = await commitFiles(env, async (head) => {
      notes.length = 0;
      const files = [];
      const seoFile = await getFile(env, SEO_PATH, head);
      if (seoFile.sha !== body.seoSha) throw fail("다른 곳에서 SEO 설정이 먼저 저장되었습니다. 새로고침한 뒤 다시 고쳐 주세요.", 409);
      const prev = JSON.parse(seoFile.text);
      const same = (k) => JSON.stringify(prev[k]) === JSON.stringify(seo[k]);
      if (image || !same("ogImage")) notes.push("공유 이미지");
      if (!same("index")) notes.push(seo.index ? "검색 노출 켬" : "검색 노출 끔");
      if (!same("verification")) notes.push("소유 확인 코드");
      if (!same("organization")) notes.push("운영 정보");
      const nextSeo = JSON.stringify({ _설명: prev._설명, ...seo }, null, 1) + "\n";
      if (nextSeo !== seoFile.text || image) files.push({ path: SEO_PATH, text: nextSeo });

      const page = await getFile(env, PAGE_PATH, head);
      let items = null;
      if (text) {
        const copyFile = await getFile(env, COPY_PATH, head);
        if (copyFile.sha !== text.sha) throw fail("다른 곳에서 문구가 먼저 저장되었습니다. 새로고침한 뒤 다시 고쳐 주세요.", 409);
        const copy = JSON.parse(copyFile.text);
        items = { ...copy.items, ...text.items };
        const errs = validateItems(items, schema, copy.items);
        if (errs.length) throw fail(errs.join(" "), 400);
        const changed = TEXT_IDS.filter((id) => items[id] !== copy.items[id]);
        if (changed.length) {
          files.push({ path: COPY_PATH, text: JSON.stringify({ ...copy, items }, null, 1) });
          notes.push(`문구 ${changed.join(", ")}`);
        } else items = null;
      }
      let next = items ? applyCopy(page.text, items) : page.text;
      next = applySeo(next, seo);
      if (next == null) throw fail(`${PAGE_PATH}에 SEO 자리(<!-- seo:start -->)가 없습니다.`, 500);
      if (next !== page.text) files.push({ path: PAGE_PATH, text: next });
      if (image) files.push(image);
      return files;
    }, () => `SEO 설정 수정: ${notes.join(", ") || "페이지 다시 만듦"}\n\n어드민에서 ${email}이 저장`);

    if (!commit) return json({ ok: true, changed: false });
    return json({ ok: true, changed: true, commit: commit.sha, ogImage: seo.ogImage, summary: notes });
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}

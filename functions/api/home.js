// 소개 사이트 저장 서버 (Cloudflare Pages Function, 어드민 /admin/home.html에서 씀)
//   GET  /api/home  → data/home-copy.json, data/home-media.json과 각 버전(sha), 로그인한 이메일
//   POST /api/home  → { items, media, uploads, copySha, mediaSha } 를 받아
//                     두 데이터 파일, 세 언어 페이지, 새 그림을 커밋 하나로 main에 올린다.
// 로그인 확인은 문구 저장 서버와 같다(../_lib/server.js). GITHUB_TOKEN 필요.
import { buildPages } from "../../home/render.js";
import { validateItems, validateMedia, resolveMedia } from "../_lib/home.js";
import { json, fail, signedInEmail, getFile, commitFiles } from "../_lib/server.js";

const COPY_PATH = "data/home-copy.json";
const MEDIA_PATH = "data/home-media.json";
const TEMPLATE_PATH = "scripts/home.template.html";

export async function onRequestGet({ request, env }) {
  try {
    const email = await signedInEmail(request, env);
    const [copy, media] = await Promise.all([getFile(env, COPY_PATH), getFile(env, MEDIA_PATH)]);
    return json({ email, copySha: copy.sha, mediaSha: media.sha, copy: JSON.parse(copy.text), media: JSON.parse(media.text) });
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
    const { items, media, uploads = {}, copySha, mediaSha } = await request.json();
    const when = stamp();
    const notes = []; // 커밋 메시지에 쓸 바뀐 것들

    const commit = await commitFiles(env, async (head) => {
      notes.length = 0;
      const [copyFile, mediaFile, template] = await Promise.all([getFile(env, COPY_PATH, head), getFile(env, MEDIA_PATH, head), getFile(env, TEMPLATE_PATH, head)]);
      if (copyFile.sha !== copySha || mediaFile.sha !== mediaSha) throw fail("다른 곳에서 먼저 저장되었습니다. 새로고침한 뒤 다시 고쳐 주세요.", 409);
      const copy = JSON.parse(copyFile.text);
      const prev = JSON.parse(mediaFile.text);

      const errors = [...validateItems(items, copy.items), ...validateMedia(media, prev, uploads)];
      if (errors.length) throw Object.assign(fail("저장하지 못했습니다.", 400), { details: errors });

      const { media: nextMedia, files: images } = resolveMedia(media, uploads, when);
      const changed = Object.keys(copy.items).filter((k) => JSON.stringify(items[k]) !== JSON.stringify(copy.items[k]));
      const same = (k) => JSON.stringify(prev[k]) === JSON.stringify(nextMedia[k]);
      if (changed.length) notes.push(`문구 ${changed.length}개`);
      if (!same("cards")) notes.push("영상 카드");
      if (!same("artists")) notes.push("아티스트 포스터");
      if (!same("ogImage")) notes.push("공유 이미지");

      const nextItems = Object.fromEntries(Object.keys(copy.items).map((k) => [k, items[k]]));
      const files = [...images];
      if (changed.length) files.push({ path: COPY_PATH, text: JSON.stringify({ ...copy, items: nextItems }, null, 1) + "\n" });
      if (notes.length > (changed.length ? 1 : 0)) files.push({ path: MEDIA_PATH, text: JSON.stringify({ _설명: prev._설명, ...nextMedia }, null, 1) + "\n" });
      for (const page of buildPages(template.text, nextItems, nextMedia)) {
        const current = await getFile(env, page.path, head);
        if (current.text !== page.text) files.push(page);
      }
      return files;
    }, () => `소개 사이트 수정: ${notes.join(", ") || "페이지 다시 만듦"}\n\n어드민에서 ${email}이 저장`);

    if (!commit) return json({ ok: true, changed: [] });
    return json({ ok: true, changed: notes, commit: commit.sha });
  } catch (e) {
    return json({ error: e.message, details: e.details }, e.status || 500);
  }
}

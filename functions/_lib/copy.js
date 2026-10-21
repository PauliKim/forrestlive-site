// 문구 저장 서버가 쓰는 순수 함수들. 네트워크를 쓰지 않아 tests/에서 그대로 점검한다.
// applyCopy는 scripts/apply_copy.py와 같은 일을 한다. 한쪽을 고치면 다른 쪽도 고친다.

const ELEMENT = /(<(\w+)\b[^>]*\bdata-copy="([A-Z]-\d+)"[^>]*>)((?:[^<]|<br>)*)(<\/\2>)/g;
const META = /(<meta\b[^>]*\bdata-copy="([A-Z]-\d+)"[^>]*\bcontent=")([^"]*)(")/g;

// Python html.escape(quote=True)와 같은 결과
export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const toHtml = (text) => text.split("\n").map(escapeHtml).join("<br>");

// index.html 문자열에 문구를 넣는다
export function applyCopy(page, items) {
  return page
    .replace(ELEMENT, (all, open, tag, key, inner, close) => (key in items ? open + toHtml(items[key]) + close : all))
    .replace(META, (all, open, key, value, close) => (key in items ? open + escapeHtml(items[key].replace(/\n/g, " ")) + close : all));
}

// 저장 요청을 검사한다. 문제가 있으면 사람이 읽을 수 있는 문장 목록을 돌려준다.
export function validateItems(items, schema, current) {
  const errors = [];
  if (!items || typeof items !== "object" || Array.isArray(items)) return ["문구 형식이 올바르지 않습니다."];
  const defs = new Map(schema.groups.flatMap((g) => g.items.map((i) => [i.id, i])));
  for (const key of Object.keys(items)) if (!defs.has(key)) errors.push(`${key}: 없는 번호입니다.`);
  for (const [id, def] of defs) {
    const v = items[id];
    if (typeof v !== "string") { errors.push(`${id}: 문구가 없습니다.`); continue; }
    if (v.length > 1000) errors.push(`${id}: 1000자를 넘습니다.`);
    if (def.locked && v !== current[id]) errors.push(`${id}: 바꿀 수 없는 문구입니다.`);
    for (const [, name] of v.matchAll(/\{(\w+)\}/g)) {
      if (!def.vars || !(name in def.vars)) errors.push(`${id}: {${name}}는 이 문구에서 쓸 수 없는 자리표시입니다.`);
    }
  }
  return errors;
}

// ---------- Cloudflare Access 로그인 확인 ----------
const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// Access가 넘겨준 토큰(JWT)의 서명·대상·만료를 확인하고 이메일을 돌려준다. 틀리면 예외.
export async function verifyAccessToken(token, { keys, aud, issuer, now = Date.now() / 1000 }) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("로그인 정보가 없습니다.");
  const [h, p, sig] = parts;
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (header.alg !== "RS256") throw new Error("지원하지 않는 서명 방식입니다.");
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("로그인 서명 키를 찾지 못했습니다.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("로그인 서명이 맞지 않습니다.");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error("이 사이트용 로그인이 아닙니다.");
  if (payload.iss !== issuer) throw new Error("로그인 발급처가 맞지 않습니다.");
  if (!payload.exp || payload.exp < now) throw new Error("로그인이 만료되었습니다. 새로고침해 주세요.");
  if (!payload.email) throw new Error("로그인한 이메일을 알 수 없습니다.");
  return payload.email;
}

// ---------- UTF-8 ↔ base64 (GitHub API용) ----------
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

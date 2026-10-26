// SEO 설정(data/seo.json)을 index.html <head>에 넣는 순수 함수들. 네트워크를 쓰지 않아 tests/에서 그대로 점검한다.
// seoBlock·applySeo는 scripts/apply_copy.py의 seo_block·apply_seo와 같은 결과를 낸다. 한쪽을 고치면 다른 쪽도 고친다.
//
// index.html의 <!-- seo:start … --> ~ <!-- seo:end --> 사이에 들어간다.
// 페이지 제목·설명·공유 문구는 data/copy.json(A-01~A-04)에 있고, 여기에는 그 밖의 값만 둔다.
import { escapeHtml } from "./copy.js";

export const SITE = "https://concert.forrestlive.com/";
const BLOCK = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
const VERIFY = [["google", "google-site-verification"], ["naver", "naver-site-verification"], ["bing", "msvalidate.01"]];

const ASSET = /^assets\/[A-Za-z0-9_/.-]+\.(?:jpe?g|png)$/;
const CODE = /^[A-Za-z0-9_.=-]{0,200}$/;

// 붙여 넣은 값이 <meta … content="코드"> 통째여도 코드만 꺼낸다
export const verificationCode = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/content\s*=\s*["']([^"']*)["']/i);
  return (m ? m[1] : s).trim();
};

// 어드민에서 받은 값을 검사하고 정리한다 → { seo, errors }
export function normalizeSeo(input) {
  const errors = [];
  const src = input && typeof input === "object" ? input : {};
  const str = (v, max, label) => {
    const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (s.length > max) errors.push(`${label}: ${max}자를 넘습니다.`);
    return s.slice(0, max);
  };
  const ogImage = String(src.ogImage || "");
  if (!ASSET.test(ogImage) || ogImage.includes("..")) errors.push("공유 이미지 경로가 올바르지 않습니다.");
  const size = (v, label) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 200 || n > 4000) errors.push(`${label}이 올바르지 않습니다.`);
    return n;
  };
  const verification = {};
  for (const [key] of VERIFY) {
    const code = verificationCode(src.verification && src.verification[key]);
    if (!CODE.test(code)) errors.push(`${key} 소유 확인 코드에 쓸 수 없는 글자가 있습니다.`);
    verification[key] = code;
  }
  const org = src.organization && typeof src.organization === "object" ? src.organization : {};
  const sameAs = (Array.isArray(org.sameAs) ? org.sameAs : []).map((u) => String(u).trim()).filter(Boolean);
  if (sameAs.length > 10) errors.push("SNS 주소는 10개까지 넣을 수 있습니다.");
  for (const u of sameAs) if (!/^https:\/\/[^\s"'<>]{3,300}$/.test(u)) errors.push(`${u}: https://로 시작하는 주소가 아닙니다.`);
  const seo = {
    index: src.index !== false,
    ogImage,
    ogImageWidth: size(src.ogImageWidth, "공유 이미지 너비"),
    ogImageHeight: size(src.ogImageHeight, "공유 이미지 높이"),
    verification,
    organization: {
      name: str(org.name, 100, "이름"),
      alternateName: str(org.alternateName, 100, "다른 이름"),
      sameAs: sameAs.slice(0, 10)
    }
  };
  if (!seo.organization.name) errors.push("이름을 넣어 주세요.");
  return { seo, errors };
}

// 구조화 데이터(검색 결과의 운영 주체 정보)
function organization(seo) {
  const o = seo.organization;
  const data = { "@context": "https://schema.org", "@type": "Organization", name: o.name };
  if (o.alternateName) data.alternateName = o.alternateName;
  data.url = SITE;
  data.logo = `${SITE}assets/logo/logo-512.png`;
  if (o.sameAs.length) data.sameAs = o.sameAs;
  return JSON.stringify(data).replace(/<\//g, "<\\/");
}

export function seoBlock(seo) {
  const image = SITE + seo.ogImage;
  const lines = [
    "<!-- seo:start 자동 생성: data/seo.json(어드민 SEO 설정). 직접 고치지 않는다 -->",
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:width" content="${seo.ogImageWidth}">`,
    `<meta property="og:image:height" content="${seo.ogImageHeight}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`
  ];
  if (!seo.index) lines.push('<meta name="robots" content="noindex, nofollow">');
  for (const [key, name] of VERIFY) {
    if (seo.verification[key]) lines.push(`<meta name="${name}" content="${escapeHtml(seo.verification[key])}">`);
  }
  lines.push(`<script type="application/ld+json">${organization(seo)}</script>`, "<!-- seo:end -->");
  return lines.join("\n");
}

// 페이지의 seo 덩어리를 바꾼다. 덩어리가 없으면 그대로(null)
export function applySeo(page, seo) {
  if (!BLOCK.test(page)) return null;
  const block = seoBlock(seo);
  return page.replace(BLOCK, () => block);
}

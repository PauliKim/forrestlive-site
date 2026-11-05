// 소개 사이트 첫 화면(/)에 들어온 사람을 어느 언어 페이지로 보낼지 정하는 순수 함수(네트워크 없음, tests/test_home.py에서 점검).
// 폰드메이커스 사이트와 같은 규칙이다.
//   대한민국(KR) → 한국어(/), 일본(JP) → /ja/, 그 밖의 나라 → /en/
//   언어 선택 메뉴에서 고른 언어(쿠키 lang)가 있으면 나라보다 앞선다.
//   검색·공유 미리보기 로봇은 옮기지 않는다(한국어 첫 화면이 검색에 그대로 잡히도록).

export const LANGS = ["ko", "en", "ja"];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|yeti|daum|bingpreview|embedly|preview|lighthouse/i;

export function langForCountry(country) {
  if (country === "KR") return "ko";
  if (country === "JP") return "ja";
  return "en";
}

export function chosenLang(cookieHeader) {
  const m = (cookieHeader || "").match(/(?:^|;\s*)lang=(ko|en|ja)(?:;|$)/);
  return m ? m[1] : null;
}

// 옮길 주소("/en/" 등)를 돌려준다. 옮기지 않으면 null.
export function redirectTarget({ method, pathname, search, country, cookie, userAgent }) {
  if (method !== "GET" && method !== "HEAD") return null;
  if (pathname !== "/" && pathname !== "/index.html") return null;
  if (/[?&]preview(?:[=&]|$)/.test(search || "")) return null; // 어드민 미리보기
  if (BOT.test(userAgent || "")) return null;
  const lang = chosenLang(cookie) || langForCountry(country);
  return lang === "ko" ? null : `/${lang}/${search || ""}`;
}

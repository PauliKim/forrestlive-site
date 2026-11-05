// 접속 주소에 따라 페이지를 나눈다. 한 Pages 프로젝트로 두 사이트를 운영하기 위해서다.
//   concert.forrestlive.com     → 저장소 루트의 공연 사이트(그대로 통과)
//   forrestlive.com             → home/ 소개 사이트. 한국어 /, 영어 /en/, 일본어 /ja/
//   home.forrestlive.pages.dev  → 위와 같음(home 브랜치 미리보기)
// 소개 사이트 첫 화면(/)에서는 나라와 고른 언어에 맞는 페이지로 옮긴다. 규칙은 _lib/lang.js.
// 이 함수는 _routes.json에 적은 경로에서만 돈다. 사진·글꼴 같은 파일은 양쪽이 같은 주소로 받는다.
import { redirectTarget } from "./_lib/lang.js";

const HOME_HOSTS = new Set(["forrestlive.com", "home.forrestlive.pages.dev"]);
const PAGES = { "/": "/home/", "/en": "/home/en/", "/ja": "/home/ja/", "/robots.txt": "/home/robots.txt", "/sitemap.xml": "/home/sitemap.xml" };
const CONCERT = "https://concert.forrestlive.com/";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (!HOME_HOSTS.has(url.hostname)) return next();

  const to = redirectTarget({
    method: request.method,
    pathname: url.pathname,
    search: url.search,
    country: request.cf && request.cf.country,
    cookie: request.headers.get("cookie"),
    userAgent: request.headers.get("user-agent")
  });
  // 사람마다 결과가 달라서 중간 캐시에 남기지 않는다
  if (to) return new Response(null, { status: 302, headers: { location: to, "cache-control": "private, no-store", vary: "cookie" } });

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if ((path === "/en" || path === "/ja") && !url.pathname.endsWith("/")) return Response.redirect(`${url.origin}${path}/${url.search}`, 301);
  if (PAGES[path]) return env.ASSETS.fetch(new URL(PAGES[path], url));

  // 프레이머 때 쓰던 주소: /ko와 템플릿에 남아 있던 빈 페이지는 첫 페이지로 보낸다
  const section = path.split("/")[1];
  if (["ko", "stories", "services", "journal"].includes(section)) return Response.redirect(url.origin + "/", 301);
  if (section === "concert") return Response.redirect(CONCERT, 301);
  return next();
}

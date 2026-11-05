// 접속 주소에 따라 페이지를 나눈다. 한 Pages 프로젝트로 두 사이트를 운영하기 위해서다.
//   concert.forrestlive.com          → 저장소 루트의 공연 사이트(그대로 통과)
//   forrestlive.com                  → home/ 소개 페이지
//   home.forrestlive.pages.dev       → 위와 같음(home 브랜치 미리보기)
// 이 함수는 _routes.json에 적은 경로에서만 돈다. 사진·글꼴 같은 파일은 양쪽이 같은 주소로 받는다.
const HOME_HOSTS = new Set(["forrestlive.com", "home.forrestlive.pages.dev"]);
const PAGES = { "/": "/home/", "/en": "/home/en/", "/ja": "/home/ja/", "/robots.txt": "/home/robots.txt", "/sitemap.xml": "/home/sitemap.xml" };
const CONCERT = "https://concert.forrestlive.com/";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (!HOME_HOSTS.has(url.hostname)) return next();

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (PAGES[path]) return env.ASSETS.fetch(new URL(PAGES[path], url));
  // 프레이머 때 쓰던 주소: /ko는 한국어 첫 페이지로, 템플릿에 남아 있던 빈 페이지도 첫 페이지로 보낸다
  if (path === "/ko" || /^\/(stories|services|journal)(\/|$)/.test(path)) return Response.redirect(url.origin + "/", 301);
  if (path === "/concert" || path.startsWith("/concert/")) return Response.redirect(CONCERT, 301);
  return next();
}

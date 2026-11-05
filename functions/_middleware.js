// 접속 주소에 따라 페이지를 나눈다. 한 Pages 프로젝트로 사이트 여럿을 운영하기 위해서다.
//   concert.forrestlive.com     → 저장소 루트의 공연 사이트(그대로 통과)
//   forrestlive.com             → home/ 한국어
//   en.forrestlive.com          → home/en/
//   ja.forrestlive.com          → home/ja/
//   home.forrestlive.pages.dev  → home 브랜치 미리보기. 한 주소에서 /, /en, /ja를 본다
// 이 함수는 _routes.json에 적은 경로에서만 돈다. 사진·글꼴 같은 파일은 모두 같은 주소로 받는다.
const ROOT_PAGE = { "forrestlive.com": "/home/", "en.forrestlive.com": "/home/en/", "ja.forrestlive.com": "/home/ja/", "home.forrestlive.pages.dev": "/home/" };
const SHARED = { "/robots.txt": "/home/robots.txt", "/sitemap.xml": "/home/sitemap.xml" };
const PREVIEW = { "/en": "/home/en/", "/ja": "/home/ja/" };
const SITE = { "/concert": "https://concert.forrestlive.com/", "/en": "https://en.forrestlive.com/", "/ja": "https://ja.forrestlive.com/" };

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const rootPage = ROOT_PAGE[url.hostname];
  if (!rootPage) return next();

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const page = path === "/" ? rootPage : SHARED[path] || (url.hostname.endsWith(".pages.dev") && PREVIEW[path]);
  if (page) return env.ASSETS.fetch(new URL(page, url));

  // forrestlive.com/concert처럼 경로로 들어오면 해당 하위 도메인으로 보낸다
  const section = "/" + path.split("/")[1];
  if (SITE[section]) return Response.redirect(SITE[section], 301);
  // 프레이머 때 쓰던 주소: /ko와 템플릿에 남아 있던 빈 페이지는 첫 페이지로 보낸다
  if (["/ko", "/stories", "/services", "/journal"].includes(section)) return Response.redirect(url.origin + "/", 301);
  return next();
}

// 소개 사이트 페이지를 그리는 함수. 어드민 미리보기(admin/home.js)와 저장 서버(functions/api/home.js)가 함께 쓴다.
// scripts/build_home.py와 같은 결과를 낸다. 한쪽을 고치면 다른 쪽도 고친다(tests/test_home.py가 비교한다).
export const PAGES = {
  ko: { file: "home/index.html", path: "/", locale: "ko_KR" },
  en: { file: "home/en/index.html", path: "/en/", locale: "en_US" },
  ja: { file: "home/ja/index.html", path: "/ja/", locale: "ja_JP" }
};
export const SITE = "https://forrestlive.com";
export const CARD_IDS = ["original.forest", "original.wheels", "partners.kcc", "partners.carol"];
const TOKEN = /\{\{([=@]?)([\w.-]+)\}\}/g;

// Python html.escape와 같은 결과
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

// 저장된 그림은 "assets/…" 경로, 어드민에서 새로 고른 그림은 data: 주소다
const imageUrl = (image) => (image.startsWith("data:") ? image : "/" + image);

export function renderHome(template, items, media, lang, { mark = false } = {}) {
  const page = PAGES[lang];
  const values = { lang, path: page.path, url: SITE + page.path, locale: page.locale, ogImage: escAttr(imageUrl(media.ogImage)) };
  for (const code of Object.keys(PAGES)) values[`cur-${code}`] = code === lang ? ' aria-current="page"' : "";
  for (const id of CARD_IDS) {
    values[`card.${id}.image`] = escAttr(imageUrl(media.cards[id].image));
    values[`card.${id}.url`] = escAttr(media.cards[id].url);
  }
  const alt = escAttr(items["philosophy.photo"][lang].replace(/\n/g, " "));
  values.artists = media.artists.map((a) => `        <li><img src="${escAttr(imageUrl(a.image))}" alt="${alt}" loading="lazy"></li>`).join("\n");

  return template.replace(TOKEN, (all, kind, key) => {
    if (kind === "@") return values[key];
    const text = items[key][lang];
    if (kind === "=") return escAttr(text.replace(/\n/g, " "));
    const html = text.split("\n").map(escText).join("<br>");
    // 어드민 미리보기에서 문구 위치를 찾기 위한 표시. <title>에는 태그를 넣을 수 없다
    return mark && !key.startsWith("meta.") ? `<span data-key="${key}">${html}</span>` : html;
  });
}

// [{ path, text }] 세 언어 페이지
export const buildPages = (template, items, media) =>
  Object.keys(PAGES).map((lang) => ({ path: PAGES[lang].file, text: renderHome(template, items, media, lang) }));

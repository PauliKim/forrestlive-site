// 소개 사이트 저장 서버가 쓰는 순수 함수. 네트워크를 쓰지 않아 tests/test_home.py에서 그대로 점검한다.
const CARDS = ["original.forest", "original.wheels", "partners.kcc", "partners.carol"];
const IMAGE_PATH = /^assets\/home\/[\w.-]+\.jpg$/;
const MAX_ARTISTS = 40;
const MAX_UPLOADS = 12;
const MAX_IMAGE = 1_400_000; // base64 길이. 어드민이 브라우저에서 줄여 보낸다

export const isYoutube = (url) => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/.test(String(url));

// 문구 검사: 세 언어 모두 있어야 하고, 항목을 더하거나 뺄 수 없다
export function validateItems(items, current) {
  if (!items || typeof items !== "object" || Array.isArray(items)) return ["문구 형식이 올바르지 않습니다."];
  const errors = [];
  for (const key of Object.keys(items)) if (!(key in current)) errors.push(`${key}: 없는 항목입니다.`);
  for (const key of Object.keys(current)) {
    for (const lang of ["ko", "en", "ja"]) {
      const v = items[key]?.[lang];
      if (typeof v !== "string" || !v.trim()) errors.push(`${key} (${lang}): 문구가 비어 있습니다.`);
      else if (v.length > 1000) errors.push(`${key} (${lang}): 1000자를 넘습니다.`);
    }
  }
  return errors;
}

// 그림·링크 검사. image는 지금 쓰는 그림 경로이거나 uploads에 있는 "new:번호"여야 한다
export function validateMedia(media, previous, uploads = {}) {
  if (!media || typeof media !== "object") return ["그림 정보 형식이 올바르지 않습니다."];
  const errors = [];
  const names = Object.keys(uploads);
  if (names.length > MAX_UPLOADS) errors.push(`새 그림은 한 번에 ${MAX_UPLOADS}장까지 저장할 수 있습니다.`);
  for (const name of names) {
    if (!/^new:\d+$/.test(name) || !/^\/9j\/[A-Za-z0-9+/=]+$/.test(String(uploads[name])) || uploads[name].length > MAX_IMAGE) errors.push("새 그림은 1MB 이하 JPG여야 합니다.");
  }
  const known = new Set([previous.ogImage, ...CARDS.map((id) => previous.cards[id].image), ...previous.artists.map((a) => a.image)]);
  const okImage = (image) => (names.includes(image) || (known.has(image) && IMAGE_PATH.test(image)));
  if (!okImage(media.ogImage)) errors.push("공유 이미지를 확인해 주세요.");
  for (const id of CARDS) {
    const card = media.cards?.[id];
    if (!card) { errors.push(`${id}: 카드가 없습니다.`); continue; }
    if (!okImage(card.image)) errors.push(`${id}: 썸네일을 확인해 주세요.`);
    if (!isYoutube(card.url)) errors.push(`${id}: 유튜브 주소가 아닙니다.`);
  }
  if (!Array.isArray(media.artists) || !media.artists.length) errors.push("아티스트 포스터는 한 장 이상이어야 합니다.");
  else {
    if (media.artists.length > MAX_ARTISTS) errors.push(`아티스트 포스터는 ${MAX_ARTISTS}장까지입니다.`);
    if (media.artists.some((a) => !a || !okImage(a.image))) errors.push("아티스트 포스터를 확인해 주세요.");
  }
  return errors;
}

// "new:번호"를 저장할 경로로 바꾼다. → { media, files: [{ path, base64 }] }
export function resolveMedia(media, uploads, stamp) {
  const files = [];
  const paths = {};
  Object.keys(uploads).forEach((name, i) => {
    paths[name] = `assets/home/upload-${stamp}-${i + 1}.jpg`;
    files.push({ path: paths[name], base64: uploads[name] });
  });
  const swap = (image) => paths[image] || image;
  return {
    files,
    media: {
      ogImage: swap(media.ogImage),
      cards: Object.fromEntries(CARDS.map((id) => [id, { image: swap(media.cards[id].image), url: media.cards[id].url.trim() }])),
      artists: media.artists.map((a) => ({ image: swap(a.image) }))
    }
  };
}

// 소개 사이트 관리. 공연 사이트 문구 관리(admin.js)와 같은 화면이고, 언어 선택과 영상 카드, 아티스트 포스터가 더 있다.
// - ../data/home-copy-schema.json 으로 문구 칸을 그리고, /api/home 에서 지금 문구와 그림을 불러온다(로그인 필요).
// - 미리보기는 저장 때와 같은 함수(../home/render.js)로 페이지를 그려 iframe에 넣는다.
// - 저장하면 /api/home 이 문구·그림 파일, 세 언어 페이지, 새 그림을 커밋 하나로 main에 올린다.
import { renderHome, PAGES, CARD_IDS } from "../home/render.js";

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));
const DRAFT_KEY = "forrest-home-draft";
const VIEWS = { pc: { w: 1280, h: 800, label: "PC" }, mobile: { w: 390, h: 844, label: "모바일" } };
const LANG_NAMES = { ko: "한국어", en: "영어", ja: "일본어" };
const CARD_NAMES = { "original.forest": "Original · 숲세권 라이브", "original.wheels": "Original · 두바퀴 라이브", "partners.kcc": "Partners · KCC", "partners.carol": "Partners · 캐롤 특집" };
const SIZES = { card: { w: 1280, h: 720 }, artist: { w: 760, h: 950 }, og: { w: 1200, h: 630 } };
const isYoutube = (url) => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/.test(url.trim());

let schema = null;
let defs = new Map();
let template = "";
let saved = {};          // 저장된 문구 { key: { ko, en, ja } }
let draft = {};
let savedMedia = null;   // 저장된 그림·링크
let draftMedia = null;
let uploads = {};        // 새로 고른 그림 { "new:1": dataURL }
let uploadCount = 0;
let copySha = null;
let mediaSha = null;
let canSave = false;
let activeId = null;
const view = { device: "pc", theme: "light", lang: "ko" };

// ---------- 상태 ----------
const textChanges = () => Object.keys(draft).flatMap((k) => Object.keys(PAGES).filter((l) => draft[k][l] !== saved[k][l]).map((lang) => ({ key: k, lang })));
const mediaChanges = () => {
  const out = [];
  for (const id of CARD_IDS) {
    if (draftMedia.cards[id].image !== savedMedia.cards[id].image) out.push({ what: `${CARD_NAMES[id]} 썸네일`, before: "지금 그림", after: "새 그림" });
    if (draftMedia.cards[id].url !== savedMedia.cards[id].url) out.push({ what: `${CARD_NAMES[id]} 링크`, before: savedMedia.cards[id].url, after: draftMedia.cards[id].url });
  }
  if (JSON.stringify(draftMedia.artists) !== JSON.stringify(savedMedia.artists)) out.push({ what: "아티스트 포스터", before: `${savedMedia.artists.length}장`, after: `${draftMedia.artists.length}장 (순서·그림 변경 포함)` });
  if (draftMedia.ogImage !== savedMedia.ogImage) out.push({ what: "공유 이미지", before: "지금 그림", after: "새 그림" });
  return out;
};
const badUrls = () => CARD_IDS.filter((id) => !isYoutube(draftMedia.cards[id].url));
const emptyTexts = () => Object.keys(draft).filter((k) => Object.values(draft[k]).some((v) => !v.trim()));

function notice(text, kind = "") {
  const el = $("#notice");
  el.hidden = !text; el.textContent = text || ""; el.className = `notice ${kind}`;
}
function refreshStatus() {
  const n = textChanges().length + mediaChanges().length;
  const errs = badUrls().length + emptyTexts().length + (draftMedia.artists.length ? 0 : 1);
  $("#status").textContent = n ? `저장하지 않은 항목 ${n}개${errs ? ` · 고칠 곳 ${errs}개` : ""}` : "저장된 내용과 같습니다";
  $("#status").classList.toggle("changed", n > 0);
  $("#save").disabled = !canSave || !n || errs > 0;
  $("#save").title = !canSave ? "로그인 후 저장할 수 있습니다" : errs ? "빈 문구나 잘못된 링크를 먼저 고쳐 주세요" : "";
  $("#revert-all").disabled = !n;
  document.querySelectorAll("#group-nav button[data-group]").forEach((b) => {
    const g = schema.groups.find((x) => x.id === b.dataset.group);
    const c = g ? g.items.filter((i) => draft[i.id][view.lang] !== saved[i.id][view.lang]).length : 0;
    const dot = b.querySelector(".n"); if (dot) dot.textContent = c || "";
  });
  try { textChanges().length ? localStorage.setItem(DRAFT_KEY, JSON.stringify({ sha: copySha, items: draft })) : localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

// ---------- 그림 ----------
const shown = (image) => uploads[image] || (image.startsWith("assets/") ? `../${image}` : image);
async function crop(file, { w: W, h: H }) {
  const bmp = await createImageBitmap(file);
  if (bmp.width < W / 2 || bmp.height < H / 2) notice(`그림이 작습니다(${bmp.width}×${bmp.height}). ${W}×${H} 이상을 권장합니다.`, "error");
  else notice("");
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const w = W / scale, h = H / scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); // 투명한 PNG는 흰 바탕에
  ctx.drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, 0, 0, W, H);
  let q = 0.86, url = canvas.toDataURL("image/jpeg", q);
  while (url.length > 1_300_000 && q > 0.5) { q -= 0.1; url = canvas.toDataURL("image/jpeg", q); }
  return url;
}
async function addImage(file, size) {
  const url = await crop(file, size);
  const name = `new:${++uploadCount}`;
  uploads[name] = url;
  return name;
}

// ---------- 칸 ----------
function renderNav() {
  const media = [["media-cards", "영상 카드"], ["media-artists", "아티스트 포스터"], ["media-og", "공유 이미지"]];
  $("#group-nav").innerHTML = media.map(([id, name]) => `<button type="button" data-jump="${id}">${name}</button>`).join("")
    + schema.groups.map((g) => `<button type="button" data-group="${g.id}" data-jump="g-${g.id}">${g.id} ${esc(g.name)}<span class="n"></span></button>`).join("");
}
function cardsHtml() {
  return CARD_IDS.map((id) => {
    const c = draftMedia.cards[id]; const bad = !isYoutube(c.url);
    return `<div class="media-card" data-card="${id}">
      <img class="media-thumb" src="${esc(shown(c.image))}" alt="">
      <div class="media-body"><b>${esc(CARD_NAMES[id])}</b>
        <input type="url" data-card-url="${id}" value="${esc(c.url)}" aria-label="${esc(CARD_NAMES[id])} 유튜브 주소" class="${bad ? "bad" : ""}">
        ${bad ? '<p class="media-err">유튜브 주소(https://)를 넣어 주세요</p>' : ""}
        <div class="media-actions"><label class="btn btn-line btn-sm file-btn">썸네일 바꾸기<input type="file" accept="image/*" data-card-image="${id}"></label>
        ${c.image !== savedMedia.cards[id].image ? `<button class="btn btn-line btn-sm" type="button" data-undo-card="${id}">되돌리기</button>` : ""}</div>
      </div></div>`;
  }).join("");
}
function artistsHtml() {
  const list = draftMedia.artists;
  return `<ul class="artist-grid">${list.map((a, i) => `<li data-artist="${i}">
      <img src="${esc(shown(a.image))}" alt="포스터 ${i + 1}">
      <div class="artist-tools">
        <button type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="앞으로">←</button>
        <button type="button" data-move="1" ${i === list.length - 1 ? "disabled" : ""} aria-label="뒤로">→</button>
        <label class="file-btn">바꾸기<input type="file" accept="image/*" data-artist-image="${i}"></label>
        <button type="button" data-remove ${list.length === 1 ? "disabled" : ""}>삭제</button>
      </div></li>`).join("")}</ul>
    <label class="btn btn-line btn-sm file-btn artist-add">포스터 추가<input type="file" accept="image/*" multiple id="artist-add"></label>`;
}
function ogHtml() {
  return `<div class="media-card"><img class="media-thumb media-og" src="${esc(shown(draftMedia.ogImage))}" alt="">
    <div class="media-body"><b>링크 미리보기 이미지</b><div class="media-actions"><label class="btn btn-line btn-sm file-btn">그림 바꾸기<input type="file" accept="image/*" id="og-image"></label></div></div></div>`;
}
function renderMedia() {
  const q = $("#search").value.trim() || $("#only-changed").checked;
  document.querySelectorAll(".group.media").forEach((el) => { el.hidden = !!q; });
  $("#media-cards .box").innerHTML = cardsHtml();
  $("#media-artists .box").innerHTML = artistsHtml();
  $("#media-og .box").innerHTML = ogHtml();
}
const koNote = (id) => (view.lang === "ko" ? "" : `<div class="field-ko">한국어: ${esc(saved[id].ko).replace(/\n/g, " / ")}</div>`);
function fieldFoot(id) {
  const v = draft[id][view.lang];
  const left = v.trim() ? "" : '<span class="err">비어 있습니다</span>';
  const right = v !== saved[id][view.lang] ? `<button type="button" data-revert="${esc(id)}">되돌리기</button>` : `${v.length}자`;
  return `<span>${left}</span><span>${right}</span>`;
}
const wasNote = (id) => (draft[id][view.lang] !== saved[id][view.lang] ? `<div class="field-was">저장된 문구: <s>${esc(saved[id][view.lang])}</s></div>` : "");
function renderFields() {
  const q = $("#search").value.trim().toLowerCase();
  const only = $("#only-changed").checked;
  const lang = view.lang;
  const groups = schema.groups.map((g) => {
    const items = g.items.filter((i) => (!only || draft[i.id][lang] !== saved[i.id][lang]) && (!q || `${i.where} ${draft[i.id][lang]}`.toLowerCase().includes(q)));
    if (!items.length) return "";
    return `<section class="group" id="g-${g.id}"><h2>${g.id}. ${esc(g.name)}</h2><p>${esc(g.desc)}</p>${items.map((i) => `
      <div class="field${i.id === activeId ? " active" : ""}" data-id="${esc(i.id)}">
        <div class="field-head"><label class="field-where" for="f-${esc(i.id)}">${esc(i.where)}</label>${draft[i.id][lang] !== saved[i.id][lang] ? '<span class="tag tag-changed">바뀜</span>' : ""}</div>
        <textarea id="f-${esc(i.id)}" data-id="${esc(i.id)}" rows="${i.multiline ? 3 : 1}" lang="${lang}" spellcheck="false">${esc(draft[i.id][lang])}</textarea>
        <div class="field-foot">${fieldFoot(i.id)}</div>${koNote(i.id)}${wasNote(i.id)}
      </div>`).join("")}</section>`;
  }).join("");
  $("#text-fields").innerHTML = groups || `<p class="empty-search">찾는 문구가 없습니다.</p>`;
  renderMedia();
}
function refreshField(id) {
  const box = document.querySelector(`.field[data-id="${CSS.escape(id)}"]`); if (!box) return;
  box.querySelector(".field-foot").innerHTML = fieldFoot(id);
  const changed = draft[id][view.lang] !== saved[id][view.lang];
  const head = box.querySelector(".field-head");
  head.querySelector(".tag-changed")?.remove();
  if (changed) head.insertAdjacentHTML("beforeend", '<span class="tag tag-changed">바뀜</span>');
  box.querySelector(".field-was")?.remove();
  box.insertAdjacentHTML("beforeend", wasNote(id));
}

// ---------- 미리보기 ----------
let frames = [];
const previewMedia = () => {
  const swap = (image) => uploads[image] || image;
  return { ogImage: swap(draftMedia.ogImage), cards: Object.fromEntries(CARD_IDS.map((id) => [id, { ...draftMedia.cards[id], image: swap(draftMedia.cards[id].image) }])), artists: draftMedia.artists.map((a) => ({ image: swap(a.image) })) };
};
const pageHtml = (theme) => renderHome(template, draft, previewMedia(), view.lang, { mark: true }).replace("<html ", `<html data-preview data-theme="${theme}" `);
function buildStage() {
  const list = view.device === "all" ? [["pc", "light"], ["mobile", "light"], ["pc", "dark"], ["mobile", "dark"]] : [[view.device, view.theme]];
  const stage = $("#stage");
  stage.className = `stage ${view.device === "all" ? "all" : "one"}`;
  stage.innerHTML = list.map(([d, th]) => `<div class="frame" data-device="${d}" data-theme="${th}">
      <div class="frame-label">${VIEWS[d].label} · ${th === "light" ? "라이트" : "다크"}</div>
      <div class="frame-box"><iframe title="${VIEWS[d].label} 미리보기" width="${VIEWS[d].w}" height="${VIEWS[d].h}"></iframe></div>
    </div>`).join("");
  frames = [...stage.querySelectorAll(".frame")].map((el) => ({ el, iframe: el.querySelector("iframe"), device: el.dataset.device, theme: el.dataset.theme, y: 0 }));
  frames.forEach((f) => f.iframe.addEventListener("load", () => prepareFrame(f)));
  fitFrames(); paint();
  $("#seg-theme").classList.toggle("off", view.device === "all");
}
function fitFrames() {
  frames.forEach((f) => {
    const box = f.el.querySelector(".frame-box");
    const v = VIEWS[f.device];
    const scale = Math.min(1, box.clientWidth / v.w, (box.clientHeight || v.h) / v.h);
    f.iframe.style.transform = `scale(${scale})`;
    f.iframe.style.left = `${Math.max(0, (box.clientWidth - v.w * scale) / 2)}px`;
  });
}
function paint() {
  frames.forEach((f) => {
    try { f.y = f.iframe.contentWindow?.scrollY || f.y; } catch (e) {}
    f.iframe.srcdoc = pageHtml(f.theme);
  });
}
let paintTimer = 0;
const paintSoon = () => { clearTimeout(paintTimer); paintTimer = setTimeout(paint, 450); };
function prepareFrame(f) {
  const doc = f.iframe.contentDocument; if (!doc) return;
  const style = doc.createElement("style");
  style.textContent = `.copy-hl { outline: 3px solid var(--bulb) !important; outline-offset: 3px; border-radius: 4px; } html { scroll-behavior: auto !important; }`;
  doc.head.appendChild(style);
  // 미리보기가 다른 곳으로 넘어가지 않게 한다
  doc.addEventListener("click", (e) => { if (e.target.closest("a[href]")) e.preventDefault(); }, true);
  f.iframe.contentWindow.scrollTo(0, f.y);
  if (activeId) locate(f, activeId);
}
function locate(f, id) {
  const doc = f.iframe.contentDocument; if (!doc) return;
  const selector = id === "media-artists" ? "#marquee" : id.startsWith("card:") ? `[data-media="${id.slice(5)}"]` : `[data-key="${CSS.escape(id)}"]`;
  doc.querySelectorAll(".copy-hl").forEach((el) => el.classList.remove("copy-hl"));
  const els = [...doc.querySelectorAll(selector)].filter((el) => el.getClientRects().length);
  if (!els.length) return;
  els.forEach((el) => el.classList.add("copy-hl"));
  const w = f.iframe.contentWindow; const r = els[0].getBoundingClientRect();
  w.scrollTo(0, Math.max(0, r.top + w.scrollY - (w.innerHeight / 2 - r.height / 2)));
}
const focusOn = (id) => { activeId = id; frames.forEach((f) => locate(f, id)); };

// ---------- 이벤트 ----------
function mediaChanged() { renderMedia(); refreshStatus(); paintSoon(); }
const fields = $("#fields");
fields.addEventListener("input", (e) => {
  const ta = e.target.closest("textarea");
  if (ta) { draft[ta.dataset.id][view.lang] = ta.value; refreshField(ta.dataset.id); refreshStatus(); paintSoon(); return; }
  const url = e.target.closest("[data-card-url]");
  if (url) {
    draftMedia.cards[url.dataset.cardUrl].url = url.value.trim();
    url.classList.toggle("bad", !isYoutube(url.value));
    refreshStatus(); paintSoon();
  }
});
fields.addEventListener("change", async (e) => {
  const input = e.target.closest('input[type="file"]');
  if (input) {
    try {
      const files = [...input.files];
      if (input.dataset.cardImage) { draftMedia.cards[input.dataset.cardImage].image = await addImage(files[0], SIZES.card); focusOn(`card:${input.dataset.cardImage}`); }
      else if (input.dataset.artistImage) draftMedia.artists[Number(input.dataset.artistImage)] = { image: await addImage(files[0], SIZES.artist) };
      else if (input.id === "artist-add") for (const file of files) draftMedia.artists.push({ image: await addImage(file, SIZES.artist) });
      else if (input.id === "og-image") draftMedia.ogImage = await addImage(files[0], SIZES.og);
      mediaChanged();
    } catch (err) {
      notice(`그림을 열지 못했습니다: ${err.message}`, "error");
    }
    return;
  }
  // 칸을 벗어나면 잘못된 주소 안내를 다시 그린다
  if (e.target.closest("[data-card-url]")) renderMedia();
});
fields.addEventListener("focusin", (e) => {
  const ta = e.target.closest("textarea");
  if (ta) {
    document.querySelectorAll(".field.active").forEach((el) => el.classList.remove("active"));
    ta.closest(".field").classList.add("active");
    focusOn(ta.dataset.id);
    return;
  }
  const card = e.target.closest("[data-card]");
  if (card) focusOn(`card:${card.dataset.card}`);
});
fields.addEventListener("click", (e) => {
  const revert = e.target.closest("[data-revert]");
  if (revert) {
    const id = revert.dataset.revert; draft[id][view.lang] = saved[id][view.lang];
    const ta = document.getElementById(`f-${id}`); if (ta) ta.value = draft[id][view.lang];
    refreshField(id); refreshStatus(); paintSoon();
    return;
  }
  const undo = e.target.closest("[data-undo-card]");
  if (undo) { draftMedia.cards[undo.dataset.undoCard].image = savedMedia.cards[undo.dataset.undoCard].image; mediaChanged(); return; }
  const item = e.target.closest("[data-artist]");
  if (!item) return;
  const i = Number(item.dataset.artist); const list = draftMedia.artists;
  const move = e.target.closest("[data-move]");
  if (move) { const j = i + Number(move.dataset.move); [list[i], list[j]] = [list[j], list[i]]; focusOn("media-artists"); mediaChanged(); }
  else if (e.target.closest("[data-remove]")) { list.splice(i, 1); focusOn("media-artists"); mediaChanged(); }
});
$("#group-nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump]"); if (!b) return;
  document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#search").addEventListener("input", renderFields);
$("#only-changed").addEventListener("change", renderFields);
$("#revert-all").addEventListener("click", () => {
  if (!confirm("저장하지 않은 내용을 모두 되돌릴까요?")) return;
  draft = clone(saved); draftMedia = clone(savedMedia); uploads = {};
  renderFields(); refreshStatus(); paint();
});
$("#seg-lang").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]"); if (!b) return;
  view.lang = b.dataset.lang;
  $("#seg-lang").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("#open-live").href = `https://forrestlive.com${PAGES[view.lang].path}`;
  renderFields(); refreshStatus(); paint();
});
$("#seg-device").addEventListener("click", (e) => {
  const b = e.target.closest("[data-device]"); if (!b) return;
  view.device = b.dataset.device;
  $("#seg-device").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  buildStage();
});
$("#seg-theme").addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme-btn]"); if (!b) return;
  view.theme = b.dataset.themeBtn;
  $("#seg-theme").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  frames.forEach((f) => {
    f.theme = view.theme; f.el.dataset.theme = view.theme;
    f.el.querySelector(".frame-label").textContent = `${VIEWS[f.device].label} · ${view.theme === "light" ? "라이트" : "다크"}`;
    const d = f.iframe.contentDocument; if (d) d.documentElement.dataset.theme = view.theme;
  });
});
window.addEventListener("resize", fitFrames);
window.addEventListener("beforeunload", (e) => { if (textChanges().length || mediaChanges().length) { e.preventDefault(); e.returnValue = ""; } });

// ---------- 저장 ----------
$("#save").addEventListener("click", () => {
  const rows = [
    ...textChanges().map(({ key, lang }) => ({ what: `${LANG_NAMES[lang]} · ${defs.get(key).where}`, before: saved[key][lang], after: draft[key][lang] })),
    ...mediaChanges()
  ];
  if (!rows.length) return;
  $("#diff").innerHTML = rows.map((c) => `<li><span class="id">${esc(c.what)}</span><span class="before">${esc(c.before)}</span><span class="after">${esc(c.after)}</span></li>`).join("");
  $("#confirm").showModal();
});
$("#confirm").addEventListener("close", async () => {
  if ($("#confirm").returnValue !== "ok") return;
  $("#save").disabled = true; $("#status").textContent = "저장하는 중";
  try {
    // 초안에 실제로 남은 새 그림만 보낸다
    const used = JSON.stringify(draftMedia);
    const send = Object.fromEntries(Object.entries(uploads).filter(([name]) => used.includes(`"${name}"`)).map(([name, url]) => [name, url.slice(url.indexOf(",") + 1)]));
    const res = await fetch("../api/home", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: draft, media: draftMedia, uploads: send, copySha, mediaSha }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error([body.error || `저장하지 못했습니다(${res.status}).`, ...(body.details || [])].join(" "));
    await load();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    renderFields(); paint();
    notice(`저장했습니다${body.changed?.length ? `(${body.changed.join(", ")})` : ""}. 1~2분 뒤 운영 사이트에 반영됩니다.`, "ok");
  } catch (e) {
    notice(e.message, "error");
  }
  refreshStatus();
});

// ---------- 시작 ----------
async function load() {
  const res = await fetch("../api/home", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `저장 서버에 연결하지 못했습니다(${res.status}).`);
  saved = body.copy.items; savedMedia = body.media; copySha = body.copySha; mediaSha = body.mediaSha;
  draft = clone(saved); draftMedia = clone(savedMedia); uploads = {}; canSave = true;
  $("#who").textContent = body.email;
}
async function start() {
  const get = (path) => fetch(path, { cache: "no-store" });
  [schema, template] = await Promise.all([get("../data/home-copy-schema.json").then((r) => r.json()), get("../scripts/home.template.html").then((r) => r.text())]);
  defs = new Map(schema.groups.flatMap((g) => g.items.map((i) => [i.id, i])));
  try {
    await load();
  } catch (e) {
    // 로그인이나 서버 설정이 없을 때: 공개된 내용으로 미리보기만 할 수 있다
    saved = (await get("../data/home-copy.json").then((r) => r.json())).items;
    savedMedia = await get("../data/home-media.json").then((r) => r.json());
    draft = clone(saved); draftMedia = clone(savedMedia);
    notice(`미리보기만 할 수 있습니다. ${e.message}`, "error");
  }
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (d && d.sha === copySha && d.items) {
      draft = Object.fromEntries(Object.keys(saved).map((k) => [k, { ...saved[k], ...d.items[k] }]));
      if (textChanges().length) notice(`저장하지 않은 문구 ${textChanges().length}개를 이어서 불러왔습니다. 필요 없으면 '모두 되돌리기'를 누르세요.`);
    }
  } catch (e) {}
  fields.innerHTML = `
    <section class="group media" id="media-cards"><h2>영상 카드</h2><p>Original Content와 Partners Content의 썸네일과 유튜브 링크입니다. 세 언어에 함께 적용됩니다. 썸네일은 16:9로 잘립니다.</p><div class="box"></div></section>
    <section class="group media" id="media-artists"><h2>아티스트 포스터</h2><p>철학 문장 아래로 흐르는 포스터입니다. 세 언어에 함께 적용됩니다. 포스터는 4:5로 잘립니다.</p><div class="box"></div></section>
    <section class="group media" id="media-og"><h2>공유 이미지</h2><p>카카오톡 등에 링크를 보낼 때 나오는 그림입니다(1200×630).</p><div class="box"></div></section>
    <div id="text-fields"></div>`;
  renderNav(); renderFields(); buildStage(); refreshStatus();
}
start().catch((e) => notice(`불러오지 못했습니다: ${e.message}`, "error"));

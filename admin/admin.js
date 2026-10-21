// 숲세권 라이브 문구 관리
// - ../data/copy-schema.json 으로 문구 칸을 그리고, /api/copy 에서 지금 문구를 불러온다(로그인 필요).
// - 미리보기는 실제 사이트(../?preview=1)를 iframe으로 띄워 window.forrestPreview로 저장 전 문구를 넣어 본다.
// - 저장하면 /api/copy 가 data/copy.json과 index.html을 main에 커밋한다.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DRAFT_KEY = "forrest-copy-draft";
  const VIEWS = { pc: { w: 1280, h: 800, label: "PC" }, mobile: { w: 390, h: 844, label: "모바일" } };

  let schema = null;          // { groups: [{ id, name, desc, items: [...] }] }
  let defs = new Map();       // id → 항목 정의
  let saved = {};             // 마지막으로 저장된 문구
  let draft = {};             // 지금 고치고 있는 문구
  let sha = null;             // 저장된 data/copy.json 버전
  let canSave = false;
  let activeId = null;
  const view = { device: "pc", theme: "light" };

  // ---------- 상태 표시 ----------
  const changedIds = () => Object.keys(draft).filter((k) => draft[k] !== saved[k]);
  function notice(text, kind = "") {
    const el = $("#notice");
    el.hidden = !text; el.textContent = text || ""; el.className = `notice ${kind}`;
  }
  function refreshStatus() {
    const n = changedIds().length;
    const errs = [...defs.keys()].filter((id) => problems(id).some((p) => p.level === "err")).length;
    $("#status").textContent = n ? `저장하지 않은 문구 ${n}개${errs ? ` · 고칠 곳 ${errs}개` : ""}` : "저장된 문구와 같습니다";
    $("#status").classList.toggle("changed", n > 0);
    $("#save").disabled = !canSave || !n || errs > 0;
    $("#save").title = !canSave ? "로그인 후 저장할 수 있습니다" : errs ? "자리표시를 먼저 고쳐 주세요" : "";
    $("#revert-all").disabled = !n;
    document.querySelectorAll("#group-nav button").forEach((b) => {
      const c = schema.groups.find((g) => g.id === b.dataset.group).items.filter((i) => draft[i.id] !== saved[i.id]).length;
      b.querySelector(".n").textContent = c ? c : "";
    });
    try { n ? localStorage.setItem(DRAFT_KEY, JSON.stringify({ sha, items: draft })) : localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  // 자리표시 검사: 없는 자리표시는 오류(저장 불가), 원래 있던 자리표시가 빠지면 경고
  function problems(id) {
    const def = defs.get(id); const v = draft[id] ?? "";
    const out = [];
    const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const name of used) if (!def.vars || !(name in def.vars)) out.push({ level: "err", text: `{${name}}는 쓸 수 없는 자리표시입니다` });
    for (const name of Object.keys(def.vars || {})) if (!used.includes(name) && (saved[id] || "").includes(`{${name}}`)) out.push({ level: "warn", text: `{${name}}가 빠져 숫자·날짜가 나오지 않습니다` });
    if (!v.trim() && (saved[id] || "").trim() && !def.hint?.includes("비워")) out.push({ level: "warn", text: "비어 있습니다" });
    return out;
  }

  // ---------- 문구 칸 ----------
  function renderNav() {
    $("#group-nav").innerHTML = schema.groups.map((g) => `<button type="button" data-group="${g.id}">${g.id} ${esc(g.name)}<span class="n"></span></button>`).join("");
  }
  function fieldFoot(id) {
    const def = defs.get(id);
    const vars = Object.entries(def.vars || {}).map(([k, d]) => `<code>{${esc(k)}}</code> ${esc(d)}`).join(" · ");
    const probs = problems(id).map((p) => `<span class="${p.level}">${esc(p.text)}</span>`).join(" ");
    const len = (draft[id] || "").length;
    const left = probs || (def.locked ? esc(def.note || "바꿀 수 없는 문구입니다.") : vars ? `<span class="vars">${vars}</span>` : def.hint ? esc(def.hint) : "");
    const right = draft[id] !== saved[id] ? `<button type="button" data-revert="${id}">되돌리기</button>` : `${len}자`;
    return `<span>${left}</span><span>${right}</span>`;
  }
  function renderFields() {
    const q = $("#search").value.trim().toLowerCase();
    const only = $("#only-changed").checked;
    const html = schema.groups.map((g) => {
      const items = g.items.filter((i) => (!only || draft[i.id] !== saved[i.id]) && (!q || `${i.id} ${i.where} ${draft[i.id]}`.toLowerCase().includes(q)));
      if (!items.length) return "";
      return `<section class="group" id="g-${g.id}"><h2>${g.id}. ${esc(g.name)}</h2><p>${esc(g.desc)}</p>${items.map((i) => `
        <div class="field${i.id === activeId ? " active" : ""}" data-id="${i.id}">
          <div class="field-head"><span class="field-id">${i.id}</span><label class="field-where" for="f-${i.id}">${esc(i.where)}</label>${i.locked ? '<span class="tag tag-locked">고정</span>' : draft[i.id] !== saved[i.id] ? '<span class="tag tag-changed">바뀜</span>' : ""}</div>
          <textarea id="f-${i.id}" data-id="${i.id}" rows="${i.multiline ? 3 : 1}" ${i.locked ? "readonly" : ""} spellcheck="false">${esc(draft[i.id])}</textarea>
          <div class="field-foot">${fieldFoot(i.id)}</div>
          ${draft[i.id] !== saved[i.id] ? `<div class="field-was">저장된 문구: <s>${esc(saved[i.id]) || "(비어 있음)"}</s></div>` : ""}
        </div>`).join("")}</section>`;
    }).join("");
    $("#fields").innerHTML = html || `<p class="empty-search">찾는 문구가 없습니다.</p>`;
  }
  // 칸 하나만 다시 그린다(입력 중 커서를 잃지 않게)
  function refreshField(id) {
    const box = document.querySelector(`.field[data-id="${id}"]`); if (!box) return;
    box.classList.toggle("has-error", problems(id).some((p) => p.level === "err"));
    box.querySelector(".field-foot").innerHTML = fieldFoot(id);
    const head = box.querySelector(".field-head");
    head.querySelector(".tag-changed")?.remove();
    if (!defs.get(id).locked && draft[id] !== saved[id]) head.insertAdjacentHTML("beforeend", '<span class="tag tag-changed">바뀜</span>');
    box.querySelector(".field-was")?.remove();
    if (draft[id] !== saved[id]) box.insertAdjacentHTML("beforeend", `<div class="field-was">저장된 문구: <s>${esc(saved[id]) || "(비어 있음)"}</s></div>`);
  }

  // ---------- 미리보기 ----------
  let frames = [];
  function buildStage() {
    const stage = $("#stage");
    const list = view.device === "all"
      ? [["pc", "light"], ["mobile", "light"], ["pc", "dark"], ["mobile", "dark"]]
      : [[view.device, view.theme]];
    stage.className = `stage ${view.device === "all" ? "all" : "one"}`;
    stage.innerHTML = list.map(([d, th]) => `<div class="frame" data-device="${d}" data-theme="${th}">
        <div class="frame-label">${VIEWS[d].label} · ${th === "light" ? "라이트" : "다크"}</div>
        <div class="frame-box"><iframe title="${VIEWS[d].label} ${th === "light" ? "라이트" : "다크"} 미리보기" src="../?preview=1" width="${VIEWS[d].w}" height="${VIEWS[d].h}"></iframe></div>
      </div>`).join("");
    frames = [...stage.querySelectorAll(".frame")].map((el) => ({ el, iframe: el.querySelector("iframe"), device: el.dataset.device, theme: el.dataset.theme }));
    frames.forEach((f) => f.iframe.addEventListener("load", () => prepareFrame(f)));
    fitFrames();
    $("#seg-theme").classList.toggle("off", view.device === "all");
  }
  // iframe을 칸 크기에 맞게 줄인다(실제 1280px·390px 화면 그대로)
  function fitFrames() {
    frames.forEach((f) => {
      const box = f.el.querySelector(".frame-box");
      const v = VIEWS[f.device];
      const scale = Math.min(1, box.clientWidth / v.w, (box.clientHeight || v.h) / v.h);
      f.iframe.style.transform = `scale(${scale})`;
      f.iframe.style.left = `${Math.max(0, (box.clientWidth - v.w * scale) / 2)}px`;
    });
  }
  function prepareFrame(f) {
    const doc = f.iframe.contentDocument; if (!doc) return;
    doc.documentElement.dataset.theme = f.theme;
    const style = doc.createElement("style");
    style.textContent = `.copy-hl { outline: 3px solid var(--bulb) !important; outline-offset: 3px; border-radius: 4px; transition: outline-color .6s; }
      .copy-hl.fade { outline-color: transparent !important; } html { scroll-behavior: auto !important; }`;
    doc.head.appendChild(style);
    // 미리보기 안 링크는 새 창으로만 열린다(미리보기가 다른 사이트로 넘어가지 않게)
    doc.addEventListener("click", (e) => { const a = e.target.closest("a[href]"); if (a && !a.getAttribute("href").startsWith("#")) { e.preventDefault(); } }, true);
    const go = () => { pushCopy(f); if (activeId) locate(f, activeId); };
    const w = f.iframe.contentWindow;
    if (w.forrestPreview?.ready) go(); else w.addEventListener("forrest:ready", go, { once: true });
  }
  const pushCopy = (f) => { try { f.iframe.contentWindow.forrestPreview?.setCopy(draft); } catch (e) {} };
  let pushTimer = 0;
  function pushAll() { clearTimeout(pushTimer); pushTimer = setTimeout(() => { frames.forEach(pushCopy); if (activeId) frames.forEach((f) => locate(f, activeId, false)); }, 120); }
  // 미리보기에서 문구 위치로 이동하고 잠깐 표시한다
  function locate(f, id, flash = true) {
    const w = f.iframe.contentWindow; const P = w?.forrestPreview; if (!P?.ready) return;
    const els = P.showFor(id);
    const doc = f.iframe.contentDocument;
    doc.querySelectorAll(".copy-hl").forEach((el) => el.classList.remove("copy-hl", "fade"));
    if (!els.length) return;
    els.forEach((el) => el.classList.add("copy-hl"));
    const first = els[0];
    if (!first.closest("dialog")) {
      const r = first.getBoundingClientRect();
      const top = r.top + w.scrollY - (w.innerHeight / 2 - r.height / 2);
      w.scrollTo(0, Math.max(0, top));
    } else first.scrollIntoView({ block: "center" });
    if (flash) setTimeout(() => els.forEach((el) => el.classList.add("fade")), 1600);
  }

  // ---------- 이벤트 ----------
  $("#fields").addEventListener("input", (e) => {
    const ta = e.target.closest("textarea"); if (!ta) return;
    draft[ta.dataset.id] = ta.value;
    refreshField(ta.dataset.id); refreshStatus(); pushAll();
  });
  $("#fields").addEventListener("focusin", (e) => {
    const ta = e.target.closest("textarea"); if (!ta) return;
    activeId = ta.dataset.id;
    document.querySelectorAll(".field.active").forEach((el) => el.classList.remove("active"));
    ta.closest(".field").classList.add("active");
    frames.forEach((f) => locate(f, activeId));
  });
  $("#fields").addEventListener("click", (e) => {
    const b = e.target.closest("[data-revert]"); if (!b) return;
    const id = b.dataset.revert; draft[id] = saved[id];
    const ta = $(`#f-${id}`); if (ta) ta.value = draft[id];
    refreshField(id); refreshStatus(); pushAll();
  });
  $("#group-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-group]"); if (!b) return;
    document.getElementById(`g-${b.dataset.group}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#search").addEventListener("input", renderFields);
  $("#only-changed").addEventListener("change", renderFields);
  $("#revert-all").addEventListener("click", () => {
    if (!confirm("저장하지 않은 문구를 모두 되돌릴까요?")) return;
    draft = { ...saved }; renderFields(); refreshStatus(); pushAll();
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
    frames.forEach((f) => { f.theme = view.theme; f.el.dataset.theme = view.theme; f.el.querySelector(".frame-label").textContent = `${VIEWS[f.device].label} · ${view.theme === "light" ? "라이트" : "다크"}`; const d = f.iframe.contentDocument; if (d) d.documentElement.dataset.theme = view.theme; });
  });
  window.addEventListener("resize", fitFrames);
  window.addEventListener("beforeunload", (e) => { if (changedIds().length) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- 저장 ----------
  $("#save").addEventListener("click", () => {
    const ids = changedIds(); if (!ids.length) return;
    $("#diff").innerHTML = ids.map((id) => `<li><span class="id">${id} · ${esc(defs.get(id).where)}</span><span class="before">${esc(saved[id]) || "(비어 있음)"}</span><span class="after">${esc(draft[id]) || "(비어 있음)"}</span></li>`).join("");
    $("#confirm").showModal();
  });
  $("#confirm").addEventListener("close", async () => {
    if ($("#confirm").returnValue !== "ok") return;
    $("#save").disabled = true; $("#status").textContent = "저장하는 중";
    try {
      const res = await fetch("../api/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: draft, sha }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([body.error || `저장하지 못했습니다(${res.status}).`, ...(body.details || [])].join(" "));
      saved = { ...draft }; sha = body.sha;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      renderFields();
      notice(`저장했습니다${body.changed?.length ? `(${body.changed.length}개)` : ""}. 1~2분 뒤 운영 사이트에 반영됩니다.${body.note ? ` ${body.note}` : ""}`, "ok");
    } catch (e) {
      notice(e.message, "error");
    }
    refreshStatus();
  });

  // ---------- 시작 ----------
  async function start() {
    schema = await fetch("../data/copy-schema.json", { cache: "no-store" }).then((r) => r.json());
    defs = new Map(schema.groups.flatMap((g) => g.items.map((i) => [i.id, i])));
    try {
      const res = await fetch("../api/copy", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `저장 서버에 연결하지 못했습니다(${res.status}).`);
      saved = body.copy.items; sha = body.sha; canSave = true;
      $("#who").textContent = body.email;
    } catch (e) {
      // 로그인이나 서버 설정이 없을 때: 공개된 문구로 미리보기만 할 수 있다
      saved = (await fetch("../data/copy.json", { cache: "no-store" }).then((r) => r.json())).items;
      notice(`미리보기만 할 수 있습니다. ${e.message}`, "error");
    }
    draft = { ...saved };
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && d.sha === sha && d.items) {
        const restored = Object.keys(d.items).filter((k) => defs.has(k) && d.items[k] !== saved[k]);
        if (restored.length) { restored.forEach((k) => (draft[k] = d.items[k])); notice(`저장하지 않은 문구 ${restored.length}개를 이어서 불러왔습니다. 필요 없으면 '모두 되돌리기'를 누르세요.`); }
      }
    } catch (e) {}
    renderNav(); renderFields(); buildStage(); refreshStatus();
  }
  start().catch((e) => notice(`문구 목록을 불러오지 못했습니다: ${e.message}`, "error"));
})();

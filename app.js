// 숲세권 라이브 공연 페이지 — data/shows.json을 읽어 공연 목록, 상세, 아카이브를 그린다.
// 고정 문구는 data/copy.json에 번호(B-06 등)로 있다. 어드민(/admin) 미리보기는 window.forrestPreview로 문구를 바꿔 본다.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  // 지점 정보는 data/venues.json(KOPIS 공연시설 상세)에서 읽는다. 불러오기 전 기본값.
  let VENUES = {
    mullae: { name: "문래점", address: "서울특별시 영등포구 도림로126길 1 (문래동3가)", floor: "지하 1층", naverPlace: "36797413" },
    kind: { name: "카인드스퀘어점", address: "서울특별시 종로구 사직로 8 (교북동)", floor: "카인드스퀘어", naverPlace: "2043943713" }
  };
  const mapUrl = (v) => (v.naverPlace ? `https://map.naver.com/p/entry/place/${v.naverPlace}` : `https://map.naver.com/p/search/${encodeURIComponent(v.address)}`);
  const kakaoUrl = (v) => (v.lat ? `https://map.kakao.com/link/map/${encodeURIComponent("숲세권 라이브 " + v.name)},${v.lat},${v.lng}` : `https://map.kakao.com/link/search/${encodeURIComponent(v.address)}`);
  const tickets = (s) => (s.tickets || []).filter((t) => t.url);
  const mainTicket = (s) => tickets(s)[0] || { site: "예매처", url: "#" };
  const EMBLEM = "assets/logo/emblem-white.png";

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- 고정 문구 ----------
  // t("C-03", { n: 7 }) → "가까운 날짜순으로 공연 7개를 모았습니다." 화면에 넣을 때는 et()로 이스케이프한다.
  let COPY = {};
  const FALLBACK = { "C-13": "공연 정보를 불러오지 못했습니다. 페이지를 새로고침해 주세요." };
  const t = (id, vars = {}) => String(COPY[id] ?? FALLBACK[id] ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const et = (id, vars) => esc(t(id, vars)).replace(/\n/g, "<br>");
  // index.html의 data-copy 요소에 문구를 넣는다(저장할 때 서버가 HTML에도 같은 값을 써 둔다)
  function applyStatic() {
    document.querySelectorAll("[data-copy]").forEach((el) => {
      const id = el.dataset.copy; if (!(id in COPY)) return;
      if (el.tagName === "META") el.setAttribute("content", COPY[id].replace(/\n/g, " "));
      else if (el.tagName === "TITLE") document.title = COPY[id];
      else el.innerHTML = et(id);
    });
  }
  // 모든 시각은 한국 시간 기준
  const kst = (d, t) => new Date(`${d}T${t || "00:00"}:00+09:00`);
  const parts = (date) => { const x = new Date(kst(date).getTime() + 9 * 3600e3); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), w: x.getUTCDay() }; };
  const hm = (t) => { if (!t) return ""; const [h, mi] = t.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${mi ? ` ${mi}분` : ""}`; };
  const dLabel = (date) => { const p = parts(date); return `${p.m + 1}월 ${p.d}일 (${WD[p.w]})`; };
  const when = (s) => {
    let t = dLabel(s.date);
    if (s.endDate && s.endDate !== s.date) t += ` ~ ${dLabel(s.endDate)}`;
    return t + (s.timeNote ? `, ${s.timeNote}` : s.time ? ` ${hm(s.time)}` : "");
  };
  const openWhen = (openAt) => { const [d, tm] = openAt.split("T"); return `${dLabel(d)} ${hm(tm)}`; };
  const openShort = (openAt) => { const p = parts(openAt.slice(0, 10)); return `${p.m + 1}월 ${p.d}일`; };

  function status(s, now) {
    const end = kst(s.endDate || s.date, s.time || "23:59");
    if (end < now) return "past";
    if (s.soldOut) return "out";
    if (s.openAt) { const [d, t] = s.openAt.split("T"); if (kst(d, t) > now) return "soon"; }
    return "on";
  }
  const STATE = { on: ["state-on", "H-02"], soon: ["state-soon", "H-03"], out: ["state-out", "H-04"], past: ["state-past", "H-05"] };
  const stateTag = (st) => `<span class="state ${STATE[st][0]}" data-copy-dyn="${STATE[st][1]}">${et(STATE[st][1])}</span>`;

  const longDate = (date) => { const p = parts(date); return `${p.m + 1}월 ${p.d}일 ${WD[p.w]}요일`; };
  const poster = (s, opts = {}) => `<div class="poster">
      <div class="blank"><img src="${EMBLEM}" alt=""></div>
      ${s.poster ? `<img src="${esc(s.poster)}" alt="${esc(s.title)} 포스터" ${opts.eager ? "" : 'loading="lazy"'} referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    </div>`;
  // 공연명과 아티스트명이 같으면(예: MONDAY:SOOP) 아래 줄에는 부제를 쓴다
  const byline = (s) => (s.title === s.artist ? s.subtitle : s.artist);

  // 카드 안의 작은 버튼: 예매 중이면 예매하기, 예매 오픈 전이면 예매처 보기. 매진은 배지로만 알린다.
  function cardBook(s, st) {
    const tk = mainTicket(s);
    const id = st === "on" ? "C-07" : "C-08";
    return `<a class="btn btn-sm ${st === "on" ? "btn-book" : "btn-line"}" href="${esc(tk.url)}" target="_blank" rel="noopener" aria-label="${esc(s.title)} ${esc(t(id))}" data-copy-dyn="${id}">${et(id)}</a>`;
  }
  // 히어로의 다음 공연 버튼
  function bookButton(s, st) {
    const tk = mainTicket(s);
    if (st === "on") return `<a class="btn btn-book" href="${esc(tk.url)}" target="_blank" rel="noopener" data-copy-dyn="B-08">${et("B-08")}</a>`;
    if (st === "soon") return `<a class="btn btn-line" href="${esc(tk.url)}" target="_blank" rel="noopener" data-copy-dyn="B-10">${et("B-10")}</a>`;
    return "";
  }

  let DATA = [];
  let now = new Date();
  const filter = { venue: "all", month: "all" };
  let year = null, showAll = false;

  // ---------- 다가오는 공연 ----------
  function upcoming() { return DATA.filter((s) => status(s, now) !== "past").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }

  function renderFilters(list) {
    const venues = [["all", et("C-04")], ...Object.entries(VENUES).map(([k, v]) => [k, esc(v.name)])];
    const months = [["all", et("C-05")], ...[...new Set(list.map((s) => s.date.slice(0, 7)))].map((ym) => [ym, `${Number(ym.slice(5))}월`])];
    $("#f-venue").innerHTML = venues.map(([k, l]) => `<button class="chip" type="button" data-k="venue" data-v="${k}" aria-pressed="${filter.venue === k}"${k === "all" ? ' data-copy-dyn="C-04"' : ""}>${l}</button>`).join("");
    $("#f-month").innerHTML = months.map(([k, l]) => `<button class="chip" type="button" data-k="month" data-v="${k}" aria-pressed="${filter.month === k}"${k === "all" ? ' data-copy-dyn="C-05"' : ""}>${l}</button>`).join("");
  }

  function renderShows() {
    const all = upcoming();
    renderFilters(all);
    const list = all.filter((s) => (filter.venue === "all" || s.venue === filter.venue) && (filter.month === "all" || s.date.startsWith(filter.month)));
    $("#up-sub").textContent = list.length ? t("C-03", { n: list.length }) : "";
    // 카드: 포스터 → 일시 → 공연명 → 아티스트 · 지점. 가격은 상세 시트에서만 보여 준다.
    // 예매 중은 기본이라 표시하지 않고, 예매 오픈 전과 매진만 포스터 위 배지로 알린다.
    const card = (s) => {
      const st = status(s, now);
      const badge = st === "soon" ? `<span class="badge" data-copy-dyn="C-09">${et("C-09", { date: openShort(s.openAt) })}</span>` : st === "out" ? `<span class="badge" data-copy-dyn="C-10">${et("C-10")}</span>` : "";
      return `<article class="show">
        <div class="poster-frame">${poster(s)}${badge}</div>
        <p class="when">${esc(when(s))}</p>
        <h4><button type="button" data-open="${s.id}">${esc(s.title)}</button></h4>
        <p class="who">${[byline(s), s.venueName].filter(Boolean).map(esc).join(" · ")}</p>
        ${st === "out" ? "" : `<div class="card-book">${cardBook(s, st)}</div>`}
      </article>`;
    };
    // 달마다 묶어서 보여 준다: "10월  공연 3개"
    const months = [...new Set(list.map((s) => s.date.slice(0, 7)))];
    $("#shows").innerHTML = list.length ? months.map((ym) => {
      const inMonth = list.filter((s) => s.date.startsWith(ym));
      return `<section class="month-group" aria-label="${Number(ym.slice(5))}월 공연">
        <div class="month"><h3>${Number(ym.slice(5))}월</h3><span data-copy-dyn="C-06">${et("C-06", { n: inMonth.length })}</span></div>
        <div class="shows">${inMonth.map(card).join("")}</div>
      </section>`;
    }).join("") : `<div class="empty"><img src="assets/img/mini-piano-sm.jpg" alt=""><div><p><strong data-copy-dyn="C-11">${et("C-11")}</strong></p><p class="meta" data-copy-dyn="C-12">${et("C-12")}</p></div></div>`;
  }

  function renderNext() {
    const s = upcoming()[0]; const el = $("#next");
    if (!s) { el.hidden = true; return; }
    const st = status(s, now);
    el.innerHTML = `<span class="label" data-copy-dyn="B-07">${et("B-07")}</span><div><b>${esc(s.title)}</b><span class="who">${esc(byline(s))}</span></div><p class="when">${longDate(s.date)} ${hm(s.time)}<br>${esc(s.venueName)}</p>
      <div class="actions">${st === "on" ? bookButton(s, st) : ""}<button class="btn btn-line" type="button" data-open="${s.id}" data-copy-dyn="B-09">${et("B-09")}</button></div>`;
    el.hidden = false;
  }

  // ---------- 지난 공연 ----------
  function renderArchive() {
    const past = DATA.filter((s) => status(s, now) === "past").sort((a, b) => b.date.localeCompare(a.date));
    const years = [...new Set(past.map((s) => s.date.slice(0, 4)))];
    if (!year) year = years[0];
    const first = past.length ? past[past.length - 1].date : "";
    $("#ar-sub").textContent = past.length ? t("D-03", { year: first.slice(0, 4), month: Number(first.slice(5, 7)), n: past.length }) : "";
    $("#years").innerHTML = years.map((y) => `<button class="chip" type="button" data-year="${y}" aria-pressed="${y === year}">${y}년 <span class="meta" data-copy-dyn="D-04">${et("D-04", { n: past.filter((s) => s.date.startsWith(y)).length })}</span></button>`).join("");
    const list = past.filter((s) => s.date.startsWith(year));
    const shown = showAll ? list : list.slice(0, 12);
    $("#archive-list").innerHTML = shown.map((s) => `<li><a href="#${s.id}" data-open="${s.id}">
        <span class="d">${s.date.slice(5).replace("-", ".")}${s.endDate !== s.date ? `–${s.endDate.slice(8)}` : ""}</span>
        <span class="t">${esc(s.title)}</span>
        <span class="a">${esc(byline(s))}</span>
        <span class="s">${esc(s.series)}, ${esc(s.venueName)}</span></a></li>`).join("");
    const more = $("#more"); more.hidden = list.length <= 12;
    more.textContent = showAll ? t("D-06") : t("D-05", { n: list.length - 12 });
    more.dataset.copyDyn = showAll ? "D-06" : "D-05";
  }

  // ---------- 기획 시리즈 ----------
  function renderSeries() {
    const count = (fn) => DATA.filter(fn).length;
    // [공연 수, 이름 번호, 설명 번호]. 이름을 비우면 그 줄은 보이지 않는다.
    const rows = [
      [count((s) => s.series === "숲세권 라이브"), "F-04", "F-05"],
      [count((s) => s.series === "MONDAY:SOOP" || s.series === "먼데이프로젝트 공동기획"), "F-06", "F-07"],
      [count((s) => s.series === "Urban Tune Forest"), "F-08", "F-09"],
      [count((s) => s.venue !== "other"), "F-10", "F-11"]
    ].filter(([, name]) => t(name).trim());
    $("#series").innerHTML = rows.map(([n, name, d]) => `<li><b data-copy-dyn="${name}">${et(name)}</b><small data-copy-dyn="${d}">${et(d)}</small><span data-copy-dyn="F-12">${et("F-12", { n })}</span></li>`).join("");
    $("#series-sub").textContent = t("F-03", { n: DATA.length });
  }

  // ---------- 상세 시트 ----------
  const sheet = $("#sheet");
  function openSheet(id, push = true) {
    const s = DATA.find((x) => x.id === id); if (!s) return;
    const st = status(s, now); const v = VENUES[s.venue];
    const facts = [
      ["H-06", when(s)],
      ["H-07", v ? `${v.name}, ${v.address}${v.floor && v.floor !== "카인드스퀘어" ? ` ${v.floor}` : ""}` : s.venueName],
      s.lineup?.length ? ["H-08", s.lineup.join(", ")] : null,
      s.runtime ? ["H-09", s.runtime] : null,
      s.price ? ["H-10", s.price] : null,
      s.age ? ["H-11", s.age] : null,
      tickets(s).length ? ["H-12", tickets(s).map((tk) => tk.site).join(", ")] : null
    ].filter(Boolean);
    const list = tickets(s);
    let book = "";
    const link = (tk, cls, id) => `<a class="btn ${cls}" href="${esc(tk.url)}" target="_blank" rel="noopener" data-copy-dyn="${id}">${et(id, { site: tk.site })}</a>`;
    if (st === "on") book = list.map((tk, i) => link(tk, i ? "btn-line" : "btn-book", "H-13")).join("") + `<small data-copy-dyn="H-14">${et("H-14")}</small>`;
    else if (st === "soon") book = `<p><strong data-copy-dyn="H-15">${et("H-15", { when: openWhen(s.openAt) })}</strong></p>` + list.map((tk) => link(tk, "btn-line", "H-16")).join("") + `<small data-copy-dyn="H-17">${et("H-17")}</small>`;
    else if (st === "out") book = `<span class="btn" aria-disabled="true" data-copy-dyn="H-18">${et("H-18")}</span>`;
    else book = list.map((tk) => link(tk, "btn-line", "H-19")).join("");
    const intros = (s.introImages || []).filter(Boolean);
    sheet.innerHTML = `<div class="sheet-inner">
      <div class="sheet-top">${stateTag(st)}<button class="close" type="button" data-close data-copy-dyn="H-01">${et("H-01")}</button></div>
      <div class="sheet-hero">${poster(s, { eager: true })}<div><h2 id="sheet-title">${esc(s.title)}</h2><p class="artist">${esc(byline(s))}</p>${s.subtitle && s.title !== s.artist ? `<p class="meta" style="color:var(--muted)">${esc(s.subtitle)}</p>` : ""}</div></div>
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
      <dl class="facts">${facts.map(([k, val]) => `<dt data-copy-dyn="${k}">${et(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>
      <div class="book">${book}</div>
      ${intros.length ? `<details class="intro-images"><summary data-copy-dyn="H-20">${et("H-20", { n: intros.length })}</summary>${intros.map((u, i) => `<img src="${esc(u)}" alt="${esc(s.title)} 소개 이미지 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`).join("")}</details>` : ""}
      <div class="share-row">
        ${v ? `<a class="btn btn-line" href="${mapUrl(v)}" target="_blank" rel="noopener" data-copy-dyn="H-21">${et("H-21")}</a>` : ""}
        <button class="btn btn-line" type="button" data-share="${s.id}" data-copy-dyn="H-22">${et("H-22")}</button>
        <span class="note" role="status" id="share-note"></span>
      </div>
    </div>`;
    if (!sheet.open) sheet.showModal();
    if (push) { try { history.replaceState(null, "", `#${s.id}`); } catch (e) {} }
  }
  function closeSheet() { if (sheet.open) sheet.close(); }
  sheet.addEventListener("close", () => { if (/^#(m\d+|pf\d+)$/.test(location.hash)) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} } });
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) closeSheet(); });

  async function copy(text, noteEl, okMsg) {
    try { await navigator.clipboard.writeText(text); noteEl.textContent = okMsg; }
    catch (err) { noteEl.textContent = t("G-07", { text }); }
  }

  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openSheet(o.dataset.open); return; }
    const c = e.target.closest(".chip[data-k]"); if (c) { filter[c.dataset.k] = c.dataset.v; renderShows(); return; }
    const y = e.target.closest("[data-year]"); if (y) { year = y.dataset.year; showAll = false; renderArchive(); return; }
    if (e.target.closest("#more")) { showAll = !showAll; renderArchive(); return; }
    const sh = e.target.closest("[data-share]");
    if (sh) { const url = location.href.split("#")[0] + "#" + sh.dataset.share; copy(url, $("#share-note"), t("H-23")); return; }
    if (e.target.closest("#copy-mail")) copy($("#mail-addr").textContent, $("#mail-note"), t("G-06"));
  });
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (DATA.some((s) => s.id === id)) openSheet(id, false); });

  let updated = "";
  function renderUpdated() {
    const u = $("#updated"); if (!u || !updated) return;
    const [d, tm] = updated.split("T");
    u.textContent = t("G-10", { date: `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${tm.slice(0, 5)}` });
  }
  function renderAll() { now = new Date(); renderNext(); renderShows(); renderArchive(); renderSeries(); renderUpdated(); }

  // 지점 정보(주소·좌표)를 KOPIS 공연시설 상세에서 받아 둔 파일로 채운다
  fetch("data/venues.json").then((r) => (r.ok ? r.json() : null)).then((v) => {
    if (!v) return;
    VENUES = v;
    document.querySelectorAll("[data-venue]").forEach((el) => {
      const x = VENUES[el.dataset.venue]; if (!x) return;
      const f = el.dataset.field;
      if (f === "address") el.textContent = `${x.address}${x.floor && x.floor !== "카인드스퀘어" ? ` ${x.floor}` : ""}`;
      else if (f === "naver") el.href = mapUrl(x);
      else if (f === "kakao") el.href = kakaoUrl(x);
      else if (f === "tel") { if (x.tel) { el.textContent = x.tel; el.parentElement.querySelectorAll("[data-row]").forEach((r) => r.removeAttribute("hidden")); } }
    });
  }).catch(() => {});

  // 문구와 공연 정보를 함께 불러온 뒤 그린다. 문구 파일이 없으면 HTML에 적힌 기본 문구를 쓴다.
  const loadCopy = fetch("data/copy.json").then((r) => (r.ok ? r.json() : null)).then((c) => { if (c) { COPY = c.items; applyStatic(); } }).catch(() => {});
  Promise.all([fetch("data/shows.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }), loadCopy]).then(([json]) => {
    DATA = json.shows;
    updated = json.updated || "";
    renderAll();
    const id = location.hash.slice(1); if (DATA.some((s) => s.id === id)) openSheet(id, false);
    setInterval(renderAll, 60000);
    window.dispatchEvent(new Event("forrest:ready"));
  }).catch(() => {
    $("#shows").innerHTML = `<p class="empty" style="grid-column:1/-1" data-copy-dyn="C-13">${et("C-13")}</p>`;
  });

  // 어드민 미리보기용: 저장 전 문구를 넣어 보고, 고른 문구가 있는 곳을 보여 준다.
  window.forrestPreview = {
    get ready() { return DATA.length > 0; },
    setCopy(items) {
      COPY = { ...items };
      applyStatic(); renderAll();
      if (sheet.open && /^#/.test(location.hash)) openSheet(location.hash.slice(1), false);
    },
    // 상세 창 문구(H-)는 해당 상태의 공연을 골라 창을 열어 보여 준다
    showFor(id) {
      const want = { "H-03": "soon", "H-15": "soon", "H-16": "soon", "H-17": "soon", "H-04": "out", "H-18": "out", "H-05": "past", "H-19": "past" }[id];
      if (id.startsWith("H-")) {
        const pick = (want && DATA.find((s) => status(s, now) === want)) || upcoming().find((s) => (s.introImages || []).length) || upcoming()[0] || DATA[0];
        if (pick) openSheet(pick.id, false);
      } else if (sheet.open) closeSheet();
      const els = [...document.querySelectorAll(`[data-copy="${id}"], [data-copy-dyn="${id}"]`)].filter((el) => el.offsetParent || el.closest("dialog[open]"));
      return els;
    }
  };
})();

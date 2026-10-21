// 숲세권 라이브 공연 페이지 — data/shows.json을 읽어 공연 목록, 상세, 아카이브를 그린다.
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
  const openLabel = (openAt) => { const [d, t] = openAt.split("T"); return `${dLabel(d)} ${hm(t)} 예매 오픈`; };
  const openShort = (openAt) => { const p = parts(openAt.slice(0, 10)); return `${p.m + 1}월 ${p.d}일`; };

  function status(s, now) {
    const end = kst(s.endDate || s.date, s.time || "23:59");
    if (end < now) return "past";
    if (s.soldOut) return "out";
    if (s.openAt) { const [d, t] = s.openAt.split("T"); if (kst(d, t) > now) return "soon"; }
    return "on";
  }
  const STATE = { on: ["state-on", "예매중"], soon: ["state-soon", "오픈 예정"], out: ["state-out", "매진"], past: ["state-past", "지난 공연"] };
  const stateTag = (st) => `<span class="state ${STATE[st][0]}">${STATE[st][1]}</span>`;

  const longDate = (date) => { const p = parts(date); return `${p.m + 1}월 ${p.d}일 ${WD[p.w]}요일`; };
  const poster = (s, opts = {}) => `<div class="poster">
      <div class="blank"><img src="${EMBLEM}" alt=""></div>
      ${s.poster ? `<img src="${esc(s.poster)}" alt="${esc(s.title)} 포스터" ${opts.eager ? "" : 'loading="lazy"'} referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    </div>`;
  // 공연명과 아티스트명이 같으면(예: MONDAY:SOOP) 아래 줄에는 부제를 쓴다
  const byline = (s) => (s.title === s.artist ? s.subtitle : s.artist);

  function bookButton(s, st) {
    const t = mainTicket(s);
    if (st === "on") return `<a class="btn btn-book" href="${esc(t.url)}" target="_blank" rel="noopener">예매하기</a>`;
    if (st === "soon") return `<a class="btn btn-line" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.site)}에서 보기</a>`;
    if (st === "out") return `<span class="btn" aria-disabled="true">매진</span>`;
    return "";
  }

  let DATA = [];
  let now = new Date();
  const filter = { venue: "all", month: "all" };
  let year = null, showAll = false;

  // ---------- 다가오는 공연 ----------
  function upcoming() { return DATA.filter((s) => status(s, now) !== "past").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }

  function renderFilters(list) {
    const venues = [["all", "모든 지점"], ...Object.entries(VENUES).map(([k, v]) => [k, v.name])];
    const months = [["all", "모든 달"], ...[...new Set(list.map((s) => s.date.slice(0, 7)))].map((ym) => [ym, `${Number(ym.slice(5))}월`])];
    $("#f-venue").innerHTML = venues.map(([k, l]) => `<button class="chip" type="button" data-k="venue" data-v="${k}" aria-pressed="${filter.venue === k}">${l}</button>`).join("");
    $("#f-month").innerHTML = months.map(([k, l]) => `<button class="chip" type="button" data-k="month" data-v="${k}" aria-pressed="${filter.month === k}">${l}</button>`).join("");
  }

  function renderShows() {
    const all = upcoming();
    renderFilters(all);
    const list = all.filter((s) => (filter.venue === "all" || s.venue === filter.venue) && (filter.month === "all" || s.date.startsWith(filter.month)));
    $("#up-sub").textContent = list.length ? `가까운 날짜부터 ${list.length}개의 공연이 기다리고 있습니다.` : "";
    // 카드: 포스터 → 일시 → 공연명 → 아티스트 · 지점. 가격은 상세 시트에서만 보여 준다.
    // 예매중은 기본이라 표시하지 않고, 오픈 예정과 매진만 포스터 위 배지로 알린다.
    const card = (s) => {
      const st = status(s, now);
      const badge = st === "soon" ? `<span class="badge">${openShort(s.openAt)} 오픈</span>` : st === "out" ? `<span class="badge">매진</span>` : "";
      return `<article class="show">
        <div class="poster-frame">${poster(s)}${badge}</div>
        <p class="when">${esc(when(s))}</p>
        <h4><button type="button" data-open="${s.id}">${esc(s.title)}</button></h4>
        <p class="who">${[byline(s), s.venueName].filter(Boolean).map(esc).join(" · ")}</p>
      </article>`;
    };
    // 달마다 묶어서 보여 준다: "10월 · 3개 공연"
    const months = [...new Set(list.map((s) => s.date.slice(0, 7)))];
    $("#shows").innerHTML = list.length ? months.map((ym) => {
      const inMonth = list.filter((s) => s.date.startsWith(ym));
      return `<section class="month-group" aria-label="${Number(ym.slice(5))}월 공연">
        <div class="month"><h3>${Number(ym.slice(5))}월</h3><span>${inMonth.length}개 공연</span></div>
        <div class="shows">${inMonth.map(card).join("")}</div>
      </section>`;
    }).join("") : `<div class="empty"><img src="assets/img/mini-piano-sm.jpg" alt=""><div><p><strong>이 조건에 맞는 공연은 아직 없습니다.</strong></p><p class="meta">다른 지점이나 달을 골라 보세요.</p></div></div>`;
  }

  function renderNext() {
    const s = upcoming()[0]; const el = $("#next");
    if (!s) { el.hidden = true; return; }
    const st = status(s, now);
    el.innerHTML = `<span class="label">다음 공연</span><div><b>${esc(s.title)}</b><span class="who">${esc(byline(s))}</span></div><p class="when">${longDate(s.date)} ${hm(s.time)}<br>${esc(s.venueName)}</p>
      <div class="actions">${st === "on" ? bookButton(s, st) : ""}<button class="btn btn-line" type="button" data-open="${s.id}">공연 정보</button></div>`;
    el.hidden = false;
  }

  // ---------- 지난 공연 ----------
  function renderArchive() {
    const past = DATA.filter((s) => status(s, now) === "past").sort((a, b) => b.date.localeCompare(a.date));
    const years = [...new Set(past.map((s) => s.date.slice(0, 4)))];
    if (!year) year = years[0];
    const first = past.length ? past[past.length - 1].date : "";
    $("#ar-sub").textContent = past.length ? `${first.slice(0, 4)}년 ${Number(first.slice(5, 7))}월 첫 무대부터 지금까지 ${past.length}번의 공연이 있었습니다.` : "";
    $("#years").innerHTML = years.map((y) => `<button class="chip" type="button" data-year="${y}" aria-pressed="${y === year}">${y}년 <span class="meta">${past.filter((s) => s.date.startsWith(y)).length}</span></button>`).join("");
    const list = past.filter((s) => s.date.startsWith(year));
    const shown = showAll ? list : list.slice(0, 12);
    $("#archive-list").innerHTML = shown.map((s) => `<li><a href="#${s.id}" data-open="${s.id}">
        <span class="d">${s.date.slice(5).replace("-", ".")}${s.endDate !== s.date ? `–${s.endDate.slice(8)}` : ""}</span>
        <span class="t">${esc(s.title)}</span>
        <span class="a">${esc(byline(s))}</span>
        <span class="s">${esc(s.series)}, ${esc(s.venueName)}</span></a></li>`).join("");
    const more = $("#more"); more.hidden = list.length <= 12;
    more.textContent = showAll ? "접기" : `${year}년 공연 ${list.length - 12}개 더 보기`;
  }

  // ---------- 기획 시리즈 ----------
  function renderSeries() {
    const count = (fn) => DATA.filter(fn).length;
    const rows = [
      [count((s) => s.series === "숲세권 라이브"), "숲세권 라이브 단독 공연", "공연마다 꽃이나 나무 이름을 하나씩 붙입니다"],
      [count((s) => s.series === "MONDAY:SOOP" || s.series === "먼데이프로젝트 공동기획"), "MONDAY:SOOP", "먼데이프로젝트와 함께 여는 월요일 밤"],
      [count((s) => s.series === "Urban Tune Forest"), "Urban Tune Forest", "2025년 크리스마스 주간의 겨울 공연"],
      [count((s) => s.venue !== "other"), "숲에서 열린 공연", "문래점과 카인드스퀘어점"]
    ];
    $("#series").innerHTML = rows.map(([n, t, d]) => `<li><b>${t}</b><small>${d}</small><span>${n}회</span></li>`).join("");
    $("#series-sub").textContent = `지금까지 ${DATA.length}번의 공연을 만들었고, 200팀이 넘는 아티스트가 이 숲에서 노래했습니다.`;
  }

  // ---------- 상세 시트 ----------
  const sheet = $("#sheet");
  function openSheet(id, push = true) {
    const s = DATA.find((x) => x.id === id); if (!s) return;
    const st = status(s, now); const v = VENUES[s.venue];
    const facts = [
      ["일시", when(s)],
      ["장소", v ? `${v.name}, ${v.address}${v.floor && v.floor !== "카인드스퀘어" ? ` ${v.floor}` : ""}` : s.venueName],
      s.lineup?.length ? ["출연", s.lineup.join(", ")] : null,
      s.runtime ? ["러닝타임", s.runtime] : null,
      s.price ? ["가격", s.price] : null,
      s.age ? ["관람 등급", s.age] : null,
      tickets(s).length ? ["예매처", tickets(s).map((t) => t.site).join(", ")] : null
    ].filter(Boolean);
    const list = tickets(s);
    let book = "";
    if (st === "on") book = list.map((t, i) => `<a class="btn ${i ? "btn-line" : "btn-book"}" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.site)}에서 예매하기</a>`).join("") + `<small>예매는 ${list.map((t) => esc(t.site)).join(", ")}에서 진행됩니다.</small>`;
    else if (st === "soon") book = `<p><strong>${openLabel(s.openAt)}</strong></p>` + list.map((t) => `<a class="btn btn-line" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.site)} 공연 페이지 보기</a>`).join("") + `<small>오픈 시각에 같은 페이지에서 예매할 수 있습니다.</small>`;
    else if (st === "out") book = `<span class="btn" aria-disabled="true">매진</span>`;
    else book = list.map((t) => `<a class="btn btn-line" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.site)} 공연 기록 보기</a>`).join("");
    const intros = (s.introImages || []).filter(Boolean);
    sheet.innerHTML = `<div class="sheet-inner">
      <div class="sheet-top">${stateTag(st)}<button class="close" type="button" data-close>닫기</button></div>
      <div class="sheet-hero">${poster(s, { eager: true })}<div><h2 id="sheet-title">${esc(s.title)}</h2><p class="artist">${esc(byline(s))}</p>${s.subtitle && s.title !== s.artist ? `<p class="meta" style="color:var(--muted)">${esc(s.subtitle)}</p>` : ""}</div></div>
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}
      <dl class="facts">${facts.map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join("")}</dl>
      <div class="book">${book}</div>
      ${intros.length ? `<details class="intro-images"><summary>공연 소개 이미지 ${intros.length}장 보기</summary>${intros.map((u, i) => `<img src="${esc(u)}" alt="${esc(s.title)} 소개 이미지 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`).join("")}</details>` : ""}
      <div class="share-row">
        ${v ? `<a class="btn btn-line" href="${mapUrl(v)}" target="_blank" rel="noopener">지도에서 보기</a>` : ""}
        <button class="btn btn-line" type="button" data-share="${s.id}">링크 복사</button>
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
    catch (err) { noteEl.textContent = `복사하지 못했습니다. 주소를 직접 선택해 복사하세요: ${text}`; }
  }

  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openSheet(o.dataset.open); return; }
    const c = e.target.closest(".chip[data-k]"); if (c) { filter[c.dataset.k] = c.dataset.v; renderShows(); return; }
    const y = e.target.closest("[data-year]"); if (y) { year = y.dataset.year; showAll = false; renderArchive(); return; }
    if (e.target.closest("#more")) { showAll = !showAll; renderArchive(); return; }
    const sh = e.target.closest("[data-share]");
    if (sh) { const url = location.href.split("#")[0] + "#" + sh.dataset.share; copy(url, $("#share-note"), "링크를 복사했습니다. 카카오톡이나 메시지에 붙여 넣어 공유하세요."); return; }
    if (e.target.closest("#copy-mail")) copy($("#mail-addr").textContent, $("#mail-note"), "메일 주소를 복사했습니다.");
  });
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (DATA.some((s) => s.id === id)) openSheet(id, false); });

  function renderAll() { now = new Date(); renderNext(); renderShows(); renderArchive(); renderSeries(); }

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

  fetch("data/shows.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((json) => {
    DATA = json.shows;
    if (json.updated) { const u = $("#updated"); if (u) u.textContent = `(${json.updated.replace("T", " ").slice(0, 16)} 기준)`; }
    renderAll();
    const id = location.hash.slice(1); if (DATA.some((s) => s.id === id)) openSheet(id, false);
    setInterval(renderAll, 60000);
  }).catch(() => {
    $("#shows").innerHTML = `<p class="empty" style="grid-column:1/-1">공연 정보를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요. 계속 안 되면 eddie@pondmakers.com으로 알려 주세요.</p>`;
  });
})();

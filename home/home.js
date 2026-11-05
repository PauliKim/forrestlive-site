// forrestlive.com 소개 페이지 동작. 문구는 data/home-copy.json → scripts/build_home.py로 HTML에 들어가 있다.
// 지점 사진은 공연 사이트와 같은 data/venue-photos.json을 쓴다.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 좁은 화면 메뉴
  const menuBtn = $("#menu-btn");
  const nav = $("#h-nav");
  const setMenu = (open) => {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  };
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

  // 철학 문장: 스크롤을 따라 낱말(일본어는 글자)이 차례로 진해진다
  const words = $(".h-words");
  const lang = document.documentElement.lang;
  const parts = lang === "ja" ? [...words.textContent] : words.textContent.split(/(\s+)/);
  words.setAttribute("aria-label", words.textContent);
  words.textContent = "";
  const spans = parts.map((part) => {
    if (!part.trim()) { words.append(part); return null; }
    const s = document.createElement("span");
    s.textContent = part;
    s.setAttribute("aria-hidden", "true");
    words.append(s);
    return s;
  }).filter(Boolean);

  // 큰 번호: 화면 가운데에 온 단계의 번호를 보여 준다
  const steps = $$(".h-step");
  const bigNum = $("#big-num");
  const showStep = () => {
    const mid = innerHeight / 2;
    let current = steps[0];
    for (const step of steps) if (step.getBoundingClientRect().top < mid) current = step;
    bigNum.textContent = $(".h-num", current).textContent;
  };

  const story = $(".h-story");
  const onScroll = () => {
    if (!calm) {
      const box = story.getBoundingClientRect();
      const span = box.height - innerHeight;
      story.classList.toggle("on", span > 0 && -box.top / span > 0.45);

      const w = words.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (innerHeight * 0.85 - w.top) / (innerHeight * 0.55 + w.height)));
      const lit = progress * spans.length;
      spans.forEach((s, i) => { s.style.opacity = Math.max(0.28, Math.min(1, lit - i + 1)); });
    }
    showStep();
  };

  if (!calm) {
    // 사진 띠는 같은 목록을 한 번 더 붙여 끊김 없이 돈다
    const list = $("#marquee ul");
    $$("li", list).forEach((li) => {
      const copy = li.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      list.append(copy);
    });
    document.documentElement.classList.add("is-scroll");
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  // 손으로 그린 동그라미는 화면에 들어올 때 그린다
  const circled = $(".h-circled");
  new IntersectionObserver((entries, io) => {
    if (entries[0].isIntersecting) { circled.classList.add("drawn"); io.disconnect(); }
  }, { threshold: 0.6 }).observe(circled);

  // 스튜디오 사진
  const track = $("#track");
  const dots = $("#dots");
  let photos = {};
  const setDot = (i) => $$("i", dots).forEach((d, n) => d.classList.toggle("on", n === i));
  const index = () => Math.round(track.scrollLeft / (track.clientWidth || 1));
  const go = (i) => {
    const last = track.children.length - 1;
    const to = i < 0 ? last : i > last ? 0 : i;
    track.scrollTo({ left: to * track.clientWidth, behavior: calm ? "auto" : "smooth" });
  };
  const render = (venue) => {
    const list = photos[venue] || [];
    if (!list.length) return;
    track.textContent = "";
    dots.textContent = "";
    list.forEach((photo, i) => {
      const slide = document.createElement("div");
      slide.className = "h-slide";
      const img = document.createElement("img");
      img.src = "/" + photo.src;
      img.alt = photo.alt || "";
      if (i) img.loading = "lazy";
      img.onload = () => img.classList.toggle("portrait", img.naturalHeight > img.naturalWidth);
      slide.append(img);
      track.append(slide);
      dots.append(document.createElement("i"));
    });
    track.scrollLeft = 0;
    setDot(0);
  };
  $("#prev").addEventListener("click", () => go(index() - 1));
  $("#next").addEventListener("click", () => go(index() + 1));
  track.addEventListener("scroll", () => setDot(index()), { passive: true });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(index() - 1);
    if (e.key === "ArrowRight") go(index() + 1);
  });
  $$(".h-seg button").forEach((btn) => btn.addEventListener("click", () => {
    const venue = btn.dataset.studio;
    $$(".h-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    $$("[data-venue-panel]").forEach((p) => { p.hidden = p.dataset.venuePanel !== venue; });
    render(venue);
  }));
  fetch("/data/venue-photos.json").then((r) => (r.ok ? r.json() : {})).then((data) => {
    photos = data;
    render("mullae");
  }).catch(() => {});
})();

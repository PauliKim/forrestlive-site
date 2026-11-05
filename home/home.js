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

  // 운영 주소는 언어별 하위 도메인이다. 미리보기처럼 다른 주소에서는 경로로 이동한다
  if (!location.hostname.endsWith("forrestlive.com")) {
    $$("a[data-path]").forEach((a) => { a.href = a.dataset.path; });
  }

  const seg = (p, from, to) => Math.min(1, Math.max(0, (p - from) / (to - from)));

  // 글을 낱말로 나눈다. 일본어는 띄어쓰기가 없어 낱말 분석기를 쓴다
  const lang = document.documentElement.lang;
  const splitter = lang === "ja" && window.Intl && Intl.Segmenter ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  const tokens = (text) => (splitter ? [...splitter.segment(text)].map((s) => s.segment) : text.split(/(\s+)/));
  const splitWords = (el) => {
    const made = [];
    el.setAttribute("aria-label", el.innerText.replace(/\s+/g, " "));
    [...el.childNodes].forEach((node) => {
      if (node.nodeType !== 3) return;
      const box = document.createDocumentFragment();
      tokens(node.textContent).forEach((part) => {
        if (!part.trim()) { box.append(part); return; }
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = part;
        s.setAttribute("aria-hidden", "true");
        box.append(s);
        made.push(s);
      });
      node.replaceWith(box);
    });
    return made;
  };

  // 철학 문장: 스크롤을 따라 낱말이 차례로 진해진다
  const words = $(".h-words");
  const spans = splitWords(words);

  // 큰 번호: 화면 가운데에 온 단계의 번호를 보여 준다
  const steps = $$(".h-step");
  const bigNum = $("#big-num");
  const showStep = () => {
    const mid = innerHeight / 2;
    let current = steps[0];
    for (const step of steps) if (step.getBoundingClientRect().top < mid) current = step;
    bigNum.textContent = $(".h-num", current).textContent;
  };

  // 첫 장면. 스크롤 위치(0~1)를 그대로 각 요소의 진행도로 옮긴다. 시간으로 도는 움직임은 없어서
  // 스크롤을 멈추면 멈추고, 되감으면 되돌아간다. 구간(시작, 끝)은 아래 숫자만 고치면 된다
  const scene = $("#scene");
  const heroCopy = $("#scene-hero");
  const photo = $("#scene-photo");
  const veil = $("#scene-veil");
  const line = $(".h-lines .line");
  const rings = $$(".h-lines .ring");
  const flood = $(".h-lines .flood");
  const city = $("#about");
  const grow = $("#scene-grow");
  let cityWords = [];
  let growWords = [];

  // 세로 화면은 그림의 가운데만 보이므로 번지는 폭을 화면 비율에 맞춘다
  const floodWidth = () => Math.min(1100, 200 + 990 * innerWidth / innerHeight);

  const reveal = (list, progress) => {
    const reach = progress * (list.length + 3);
    list.forEach((w, i) => {
      const t = Math.min(1, Math.max(0, (reach - i) / 3));
      w.style.opacity = t;
      w.style.transform = `translateY(${(1 - t) * 0.5}em)`;
    });
  };
  const draw = (p) => {
    const heroOut = seg(p, 0.02, 0.2);
    heroCopy.style.opacity = 1 - heroOut;
    heroCopy.style.transform = `translateY(${-heroOut * 64}px)`;
    heroCopy.style.visibility = heroOut === 1 ? "hidden" : "visible";

    photo.style.transform = `scale(${1 + seg(p, 0, 0.62) * 0.22})`;
    veil.style.opacity = seg(p, 0.1, 0.42) * 0.74;

    line.style.strokeDashoffset = 1 - (0.1 + 0.9 * seg(p, 0, 0.54));
    rings[0].style.strokeDashoffset = 1 - seg(p, 0.08, 0.56);
    rings[1].style.strokeDashoffset = 1 - seg(p, 0.14, 0.58);
    flood.style.strokeWidth = seg(p, 0.56, 0.8) * floodWidth();

    reveal(cityWords, seg(p, 0.24, 0.4));
    city.style.opacity = 1 - seg(p, 0.52, 0.6);
    city.style.visibility = p > 0.2 && p < 0.6 ? "visible" : "hidden";
    grow.style.visibility = p > 0.68 ? "visible" : "hidden";
    reveal(growWords, seg(p, 0.72, 0.92));
  };

  // 휠 한 칸의 끊김만 살짝 메운다. 진행도 자체는 스크롤과 비례한다
  let shown = -1;
  let wanted = 0;
  let running = false;
  const tick = () => {
    shown = shown < 0 ? wanted : shown + (wanted - shown) * 0.14;
    if (Math.abs(wanted - shown) < 0.0004) shown = wanted;
    draw(shown);
    running = shown !== wanted;
    if (running) requestAnimationFrame(tick);
  };

  const onScroll = () => {
    if (!calm) {
      const box = scene.getBoundingClientRect();
      wanted = seg(-box.top + 68, 0, box.height - (innerHeight - 68));
      if (!running) { running = true; requestAnimationFrame(tick); }

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
    cityWords = $$("[data-reveal]", city).flatMap(splitWords);
    growWords = splitWords($("[data-reveal]", grow));
    document.documentElement.classList.add("is-scroll");
    // ABOUT 메뉴는 고정된 장면 안의 도시 문구 위치로 간다
    $$('a[href="#about"]').forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const top = scene.getBoundingClientRect().top + scrollY - 68;
      scrollTo({ top: top + 0.42 * (scene.offsetHeight - innerHeight + 68), behavior: "smooth" });
    }));
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

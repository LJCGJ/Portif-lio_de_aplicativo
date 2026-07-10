/* main.js — tema, playground do motor na home, últimos posts */
(function () {
  "use strict";

  /* ---- Tema claro/escuro ---- */
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  if (!saved) {
    saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", saved);

  function updateToggle(btn) {
    if (!btn) return;
    var dark = root.getAttribute("data-theme") === "dark";
    btn.textContent = dark ? "\u2600" : "\u263D"; // sol / lua
    btn.setAttribute("aria-label", dark ? "Mudar para tema claro" : "Mudar para tema escuro");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    updateToggle(toggle);
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) {}
        updateToggle(toggle);
      });
    }

    setupPlayground();
    loadLatestPosts();
    applySiteTexts();
    loadProjects();
  });

  /* ---- Textos editáveis (data/site.json) ---- */
  function applySiteTexts() {
    // só busca se a página tiver algum alvo
    var hasTargets = document.getElementById("hero-title") ||
                     document.getElementById("footer-who");
    if (!hasTargets) return;
    fetch("data/site.json")
      .then(function (r) { return r.json(); })
      .then(function (s) {
        var hero = s.hero || {}, footer = s.footer || {};
        var play = s.playground || {}, secs = s.sections || {};
        function setText(id, v) { var el = document.getElementById(id); if (el && v) el.textContent = v; }
        setText("hero-eyebrow", hero.eyebrow);
        var t = document.getElementById("hero-title");
        if (t && hero.title_html) t.innerHTML = hero.title_html;
        setText("hero-lead", hero.lead);
        setText("hero-btn-primary", hero.btn_primary);
        setText("hero-btn-github", hero.btn_github);
        setText("engine-cap", play.caption);
        setText("sec-featured-title", secs.featured_title);
        setText("sec-projects-title", secs.projects_title);
        setText("sec-blog-title", secs.blog_title);
        setText("footer-note", footer.note);
        document.querySelectorAll("#footer-who").forEach(function (n) { if (footer.who) n.textContent = footer.who; });
        document.querySelectorAll("#footer-meta").forEach(function (n) { if (footer.meta) n.textContent = footer.meta; });
      })
      .catch(function () { /* mantém o texto padrão do HTML */ });
  }

  /* ---- Projetos (data/projects.json) ---- */
  function loadProjects() {
    var host = document.getElementById("projects-grid");
    if (!host) return;
    fetch("data/projects.json")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!list.length) {
          host.innerHTML = '<p class="mono" style="color:var(--ink-faint)">Nenhum projeto cadastrado.</p>';
          return;
        }
        host.innerHTML = list.map(projectCard).join("");
        buildCarousel(list);
      })
      .catch(function () {
        host.innerHTML = '<p class="mono">Não consegui carregar os projetos.</p>';
      });
  }

  function projectCard(p) {
    var actions = (p.actions || []).map(function (a) {
      var cls = a.style === "primary" ? "btn btn-primary" : "btn btn-ghost";
      var ext = a.external ? ' target="_blank" rel="noopener"' : "";
      return '<a class="' + cls + '" href="' + esc(a.href) + '"' + ext + ">" + esc(a.label) + "</a>";
    }).join(" ");
    return (
      '<article class="card' + (p.featured ? " feature" : "") + '">' +
        (p.kicker ? '<p class="kicker">' + esc(p.kicker) + "</p>" : "") +
        "<h3>" + esc(p.title) + "</h3>" +
        '<p class="desc">' + esc(p.desc || "") + "</p>" +
        '<div class="tags">' + (p.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
        (actions ? '<div class="card-actions">' + actions + "</div>" : "") +
      "</article>"
    );
  }


  /* ---- Carrossel de destaques (home) ---- */
  function buildCarousel(list) {
    var track = document.getElementById("car-track");
    if (!track) return;
    var section = document.getElementById("destaques");

    var featured = list
      .map(function (p, i) { return { p: p, i: i }; })
      .filter(function (x) { return x.p.carousel; })
      .sort(function (a, b) { return (a.p.order || 99) - (b.p.order || 99) || a.i - b.i; })
      .map(function (x) { return x.p; });
    if (!featured.length) featured = list.slice(0, 3); // reserva: primeiros projetos

    track.innerHTML = featured.map(function (p) {
      return '<div class="car-slide">' + projectCard(p) + "</div>";
    }).join("");

    var dotsHost = document.getElementById("car-dots");
    var slides = Array.prototype.slice.call(track.children);
    if (dotsHost) {
      dotsHost.innerHTML = slides.map(function (_, i) {
        return '<button class="car-dot" type="button" aria-label="Destaque ' + (i + 1) + '"></button>';
      }).join("");
    }
    var dots = dotsHost ? Array.prototype.slice.call(dotsHost.children) : [];

    function current() {
      var x = track.scrollLeft, best = 0, dist = Infinity;
      slides.forEach(function (s, i) {
        var d = Math.abs(s.offsetLeft - x);
        if (d < dist) { dist = d; best = i; }
      });
      return best;
    }
    function goTo(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[i].offsetLeft, behavior: "smooth" });
    }
    function paint() {
      var c = current();
      dots.forEach(function (d, i) { d.classList.toggle("on", i === c); });
    }
    dots.forEach(function (d, i) { d.addEventListener("click", function () { goTo(i); pause(); }); });

    var prev = document.getElementById("car-prev");
    var next = document.getElementById("car-next");
    if (prev) prev.addEventListener("click", function () { goTo(current() - 1); pause(); });
    if (next) next.addEventListener("click", function () { goTo(current() + 1); pause(); });

    var t;
    track.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(paint, 80); }, { passive: true });
    paint();

    /* auto-avanço gentil: para com o mouse em cima, toque ou preferência de menos movimento */
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var timer = null, idle = 0;
    function tick() {
      if (document.hidden) return;
      var c = current();
      goTo(c + 1 >= slides.length ? 0 : c + 1);
    }
    function play() { if (!reduced && slides.length > 1 && !timer) timer = setInterval(tick, 7000); }
    function pause() { clearInterval(timer); timer = null; clearTimeout(idle); idle = setTimeout(play, 20000); }
    if (section) {
      section.addEventListener("mouseenter", pause);
      section.addEventListener("touchstart", pause, { passive: true });
      section.addEventListener("focusin", pause);
    }
    play();
  }

  /* ---- Playground do motor (home) ---- */
  function setupPlayground() {
    var editor = document.getElementById("engine-editor");
    var preview = document.getElementById("engine-preview");
    var status = document.getElementById("engine-status");
    var dot = document.getElementById("engine-dot");
    if (!editor || !preview) return;

    if (!editor.value) {
      editor.value =
        "# Olá 👋\n\nEste bloco foi renderizado por um motor em **C++**,\n" +
        "compilado para **WebAssembly** e rodando aqui no seu navegador.\n\n" +
        "- listas\n- `código inline`\n- [links](https://github.com/LJCGJ)\n\n" +
        "> Markdown entra, HTML sai.";
    }

    window.MdEngine.ready.then(function (engine) {
      if (status) status.textContent = engine.name;
      if (dot && engine.wasm) dot.classList.add("live");
      var render = function () { preview.innerHTML = engine.render(editor.value); };
      render();
      var t;
      editor.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(render, 90);
      });
    });
  }

  /* ---- Últimos posts na home ---- */
  function loadLatestPosts() {
    var host = document.getElementById("home-posts");
    if (!host) return;
    fetch("posts/posts.json")
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        posts.sort(function (a, b) { return b.date < a.date ? -1 : 1; });
        var latest = posts.slice(0, 3);
        host.innerHTML = latest.map(postRow).join("");
      })
      .catch(function () {
        host.innerHTML = '<p class="mono" style="color:var(--ink-faint)">Sem posts ainda.</p>';
      });
  }

  function postRow(p) {
    return (
      '<article class="post-item">' +
        '<div class="date">' + fmtDate(p.date) + "</div>" +
        "<div>" +
          '<h3><a href="post.html?slug=' + encodeURIComponent(p.slug) + '">' + esc(p.title) + "</a></h3>" +
          '<p class="summary">' + esc(p.summary || "") + "</p>" +
          '<div class="tags">' + (p.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function fmtDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // expõe helpers pro blog.js
  window.SiteUtil = { fmtDate: fmtDate, esc: esc };
})();

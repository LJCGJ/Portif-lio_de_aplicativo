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
        var el;
        if ((el = document.getElementById("hero-eyebrow")) && hero.eyebrow) el.textContent = hero.eyebrow;
        if ((el = document.getElementById("hero-title")) && hero.title_html) el.innerHTML = hero.title_html;
        if ((el = document.getElementById("hero-lead")) && hero.lead) el.textContent = hero.lead;
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

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
  });

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

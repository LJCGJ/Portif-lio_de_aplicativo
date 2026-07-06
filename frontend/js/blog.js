/* blog.js — usado por blog.html (lista) e post.html (um post) */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("blog-list")) renderList();
    if (document.getElementById("article")) renderPost();
  });

  function fmtDate(iso) {
    return (window.SiteUtil && window.SiteUtil.fmtDate)
      ? window.SiteUtil.fmtDate(iso) : iso;
  }
  function esc(s) {
    return (window.SiteUtil && window.SiteUtil.esc)
      ? window.SiteUtil.esc(s)
      : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---- Lista (blog.html) ---- */
  function renderList() {
    var host = document.getElementById("blog-list");
    fetch("posts/posts.json")
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        posts.sort(function (a, b) { return b.date < a.date ? -1 : 1; });
        host.innerHTML = posts.map(function (p) {
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
        }).join("");
      })
      .catch(function () {
        host.innerHTML = '<p class="mono">Não consegui carregar a lista de posts.</p>';
      });
  }

  /* ---- Post único (post.html?slug=...) ---- */
  function renderPost() {
    var article = document.getElementById("article");
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("slug");

    if (!slug) { article.innerHTML = errorBox("Nenhum post especificado."); return; }
    if (!/^[a-z0-9\-]+$/i.test(slug)) { article.innerHTML = errorBox("Endereço de post inválido."); return; }

    fetch("posts/posts.json")
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        var meta = posts.filter(function (p) { return p.slug === slug; })[0];
        if (!meta) { article.innerHTML = errorBox("Post não encontrado."); return; }
        document.title = meta.title + " — Leonardo Gonzaga";
        return Promise.all([meta, fetch("posts/" + slug + ".md").then(function (r) {
          if (!r.ok) throw new Error("md 404");
          return r.text();
        }), window.MdEngine.ready]);
      })
      .then(function (bundle) {
        if (!bundle) return;
        var meta = bundle[0], md = bundle[1], engine = bundle[2];
        var body = md.replace(/^---\n[\s\S]*?\n---\n/, ""); // remove front-matter se houver
        article.innerHTML =
          '<header class="article-head">' +
            '<div class="date">' + fmtDate(meta.date) + "</div>" +
            "<h1>" + esc(meta.title) + "</h1>" +
            '<div class="tags">' + (meta.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
          "</header>" +
          '<div class="prose">' + engine.render(body) + "</div>" +
          '<p class="byline" style="margin-top:2.5rem"><span class="dot"></span> renderizado por ' + esc(engine.name) + "</p>" +
          '<p style="margin-top:1.5rem"><a class="mono" href="blog.html">\u2190 voltar ao blog</a></p>';
      })
      .catch(function () {
        article.innerHTML = errorBox("Não consegui carregar este post.");
      });
  }

  function errorBox(msg) {
    return '<div class="article-head"><h1>' + esc(msg) + "</h1>" +
      '<p><a class="mono" href="blog.html">\u2190 voltar ao blog</a></p></div>';
  }
})();

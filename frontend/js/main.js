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

    loadLatestPosts();
    applySiteTexts();
    loadProjects();
    loadFeed();
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
        var secs = s.sections || {};
        function setText(id, v) { var el = document.getElementById(id); if (el && v) el.textContent = v; }
        setText("hero-eyebrow", hero.eyebrow);
        var t = document.getElementById("hero-title");
        if (t && hero.title_html) t.innerHTML = hero.title_html;
        setText("hero-lead", hero.lead);
        setText("hero-btn-primary", hero.btn_primary);
        setText("hero-btn-github", hero.btn_github);
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
        "<h3>" + (p.icon ? '<span class="card-icon" aria-hidden="true">' + esc(p.icon) + "</span> " : "") + esc(p.title) + "</h3>" +
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
      if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) return slides.length - 1;
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
    if (prev) prev.addEventListener("click", function () { var c = current(); goTo(c === 0 ? slides.length - 1 : c - 1); pause(); });
    if (next) next.addEventListener("click", function () { var c = current(); goTo(c >= slides.length - 1 ? 0 : c + 1); pause(); });

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

  /* ---- Feed de curiosidades + status (home) ---------------------------- *
   * Autônomo: junta 3 fontes em paralelo, mescla por data e renderiza com  *
   * o MESMO motor C++/Wasm (monta Markdown e passa por engine.render).      *
   *   1) data/feed.json          -> curiosidades/avisos manuais            *
   *   2) API pública do GitHub    -> releases e commits recentes           *
   *   3) posts/posts.json         -> últimas publicações do blog           *
   * Qualquer fonte que falhar é ignorada; o resto continua aparecendo.     *
   * -------------------------------------------------------------------- */
  var GITHUB_USER = "LJCGJ";

  // nomes amigáveis dos repositórios no feed (reserva: troca -_ por espaço)
  var NOMES_REPOS = {
    "Portif-lio_de_aplicativo": "Portfólio LJCGJ.dev",
    "Limpador_arquivos": "Limpador de Arquivos"
  };
  var REPO_SITE = "Portif-lio_de_aplicativo"; // commits do painel admin moram aqui
  var LANGS = {}; // linguagem principal de cada repositório (vem da API /repos)

  function prettyRepo(nome) {
    nome = String(nome || "").replace(GITHUB_USER + "/", "");
    return NOMES_REPOS[nome] || nome.replace(/[-_]+/g, " ");
  }

  function loadFeed() {
    var host = document.getElementById("feed-body");
    if (!host) return;
    // resolve mesmo se uma fonte cair (nunca rejeita)
    function soft(promise, onOk) {
      return promise.then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(onOk).catch(function () { return []; });
    }

    var pLocal = soft(fetch("data/feed.json"), function (list) {
      return (list || []).map(function (it) {
        return { tag: it.tag || "Curiosidade", text: it.text || "", date: it.date, origin: "local" };
      });
    });
    // obs: curiosidades manuais preservam Markdown de propósito (posso usar **negrito**, [links]);
    // só as fontes automáticas (GitHub) passam por mdSafe, pois vêm de dados não controlados.

    var pGitHub = soft(
      fetch("https://api.github.com/users/" + GITHUB_USER + "/events/public?per_page=100"),
      function (events) {
        if (events && events.length) {
          try { localStorage.setItem("feed_gh_cache", JSON.stringify(events)); } catch (e) {}
        }
        return normalizeGitHub(events);
      }
    );

    // repositórios do usuário: garante que projetos novos apareçam mesmo
    // quando o evento de criação já saiu da janela da API de eventos
    var pRepos = soft(
      fetch("https://api.github.com/users/" + GITHUB_USER + "/repos?sort=created&per_page=20"),
      function (repos) {
        if (repos && repos.length) {
          try { localStorage.setItem("feed_gh_repos", JSON.stringify(repos)); } catch (e) {}
        }
        return normalizeRepos(repos);
      }
    );

    // commits do repositório do site (a API de eventos não traz mensagens)
    var pSite = soft(
      fetch("https://api.github.com/repos/" + GITHUB_USER + "/" + REPO_SITE + "/commits?per_page=30"),
      function (lista) {
        if (lista && lista.length) {
          try { localStorage.setItem("feed_gh_site", JSON.stringify(lista)); } catch (e) {}
        }
        return normalizeSiteCommits(lista);
      }
    );

    var pPosts = soft(fetch("posts/posts.json"), function (posts) {
      return (posts || []).slice(0, 5).map(function (p) {
        return {
          tag: "Blog",
          text: "Novo post: [" + mdSafe(p.title || "publicação") + "](post.html?slug=" + encodeURIComponent(p.slug) + ").",
          date: p.date,
          origin: "blog"
        };
      });
    });

    Promise.all([pLocal, pGitHub, pPosts, pRepos, pSite]).then(function (parts) {
      var ghItems = parts[1];
      // API sem resposta (rate limit / offline)? tenta a última boa guardada
      if (!ghItems.length) {
        try {
          var cached = JSON.parse(localStorage.getItem("feed_gh_cache") || "[]");
          ghItems = normalizeGitHub(cached);
        } catch (e) { ghItems = []; }
      }
      var repoItems = parts[3];
      if (!repoItems.length) {
        try {
          var cachedR = JSON.parse(localStorage.getItem("feed_gh_repos") || "[]");
          repoItems = normalizeRepos(cachedR);
        } catch (e) { repoItems = []; }
      }
      var siteItems = parts[4];
      if (!siteItems.length) {
        try {
          var cachedS = JSON.parse(localStorage.getItem("feed_gh_site") || "[]");
          siteItems = normalizeSiteCommits(cachedS);
        } catch (e) { siteItems = []; }
      }

      // remove repetições do mesmo acontecimento (tipo+repositório+dia)
      var porRepo = {};
      var items = parts[0].concat(ghItems, repoItems, siteItems, parts[2])
        .filter(function (it) { return it.text; })
        .map(function (it) { it.ts = new Date(it.date).getTime() || 0; return it; })
        .sort(function (a, b) { return b.ts - a.ts; })
        .filter(function (it) {
          if (it.origin !== "github" || !it.key) return true;
          if (porRepo[it.key]) return false;
          porRepo[it.key] = true;
          return true;
        })
        .slice(0, 30);

      if (!items.length) {
        host.innerHTML = '<p class="mono" style="color:var(--ink-faint)">Sem novidades por enquanto.</p>';
        return;
      }

      // cada item: cabeçalho estruturado + texto renderizado pelo motor C++/Wasm.
      // O tempo real da renderização é medido e vira o item fixado no topo.
      window.MdEngine.ready.then(function (engine) {
        var t0 = performance.now();
        var corpo = items.map(function (it) {
          var m = feedMeta(it.tag, it.repoKey);
          return (
            '<div class="feed-item">' +
              '<div class="fi-head">' +
                '<span class="fi-icon">' + m.icon + '</span>' +
                '<span class="fi-tags ' + m.cls + '">' +
                  m.tags.map(function (t) { return "[" + esc(t) + "]"; }).join(" ") +
                '</span>' +
                '<span class="fi-date">Data: ' + feedWhen(it.ts) + '</span>' +
              '</div>' +
              '<div class="fi-text">' + engine.render(it.text) + '</div>' +
            '</div>'
          );
        }).join("");
        var dt = performance.now() - t0;
        var ms = (dt < 1 ? dt.toFixed(2) : dt.toFixed(1)).replace(".", ",");
        var mp = feedMeta("Status");
        var pinned =
          '<div class="feed-item status-live">' +
            '<div class="fi-head">' +
              '<span class="fi-icon">' + mp.icon + '</span>' +
              '<span class="fi-tags ' + mp.cls + '">' +
                mp.tags.map(function (t) { return "[" + esc(t) + "]"; }).join(" ") +
              '</span>' +
              '<span class="fi-date">Data: Agora</span>' +
            '</div>' +
            '<div class="fi-text">' + engine.render("Motor Wasm ativo: os " + items.length + " itens deste feed foram renderizados em **" + ms + " ms** no seu dispositivo.") + '</div>' +
          '</div>';
        host.innerHTML = pinned + corpo;
      });
    });
  }

  // transforma eventos crus do GitHub em itens do feed
  function normalizeGitHub(events) {
    var out = [];
    var somaDia = {}; // repositório+dia -> total de commits publicados no dia
    (events || []).forEach(function (e) {
      if (e.type !== "ReleaseEvent" && e.type !== "PushEvent" && e.type !== "CreateEvent") return;
      var bruto = (e.repo && e.repo.name ? e.repo.name : "").replace(GITHUB_USER + "/", "");
      var repo = mdSafe(prettyRepo(bruto));
      var dia = diaLocal(e.created_at);

      if (e.type === "ReleaseEvent") {
        var rel = e.payload && e.payload.release ? (e.payload.release.name || e.payload.release.tag_name) : "";
        out.push({
          tag: "Release",
          text: "Versão " + (rel ? mdSafe(rel) + " " : "") + "de **" + repo + "** publicada e disponível para download.",
          date: e.created_at, origin: "github", key: "rel|" + bruto + "|" + (rel || dia)
        });
        return;
      }

      if (e.type === "CreateEvent") {
        // só criação de repositório (ignora branches e tags)
        if (!e.payload || e.payload.ref_type !== "repository") return;
        out.push({
          tag: "Repo",
          text: "Novo projeto no GitHub: **" + repo + "**.",
          date: e.created_at, origin: "github", key: "new|" + bruto, repoKey: bruto
        });
        return;
      }

      // PushEvent — obs: a API pública de eventos não expõe mensagens de commit,
      // então o repositório do site é coberto pela API de commits (normalizeSiteCommits)
      if (bruto === REPO_SITE) return;
      var genericos = (e.payload && typeof e.payload.size === "number" && e.payload.size > 0)
        ? e.payload.size
        : 1; // sem tamanho informado: cada push web equivale a 1 commit
      {
        var k = "push|" + bruto + "|" + dia;
        if (!somaDia[k]) {
          somaDia[k] = { bruto: bruto, repo: repo, n: 0, date: e.created_at };
          out.push(somaDia[k]); // marcador; texto final montado abaixo
        }
        somaDia[k].n += genericos;
        somaDia[k].key = k;
      }
    });
    // fecha os agregados de push: um item por repositório/dia com a soma real
    out = out.map(function (it) {
      if (!it.tag && it.repo) {
        var n = it.n;
        return {
          tag: "Código",
          text: "Código de **" + it.repo + "** atualizado" + (n ? " — " + n + " commit" + (n > 1 ? "s" : "") + " publicado" + (n > 1 ? "s" : "") : "") + ".",
          date: it.date, origin: "github", key: it.key, repoKey: it.bruto
        };
      }
      return it;
    });
    return out;
  }

  // commits do repositório do site: ações do painel admin + contagem exata por dia
  function normalizeSiteCommits(lista) {
    var out = [], somaDia = {};
    (lista || []).forEach(function (c) {
      var msg = c && c.commit && c.commit.message ? c.commit.message : "";
      var data = c && c.commit && c.commit.author && c.commit.author.date ? c.commit.author.date : null;
      if (!data) return;
      var dia = diaLocal(data);
      var it = adminCommitItem(msg);
      if (it) {
        it.date = data;
        it.origin = "github";
        it.key = "adm|" + it.key + "|" + dia;
        it.repoKey = REPO_SITE;
        out.push(it);
      } else {
        var k = "push|" + REPO_SITE + "|" + dia;
        if (!somaDia[k]) {
          somaDia[k] = { n: 0, date: data, key: k, site: true };
          out.push(somaDia[k]);
        }
        somaDia[k].n++;
      }
    });
    return out.map(function (it) {
      if (it.site) {
        var n = it.n;
        return {
          tag: "Código",
          text: "Código de **" + mdSafe(prettyRepo(REPO_SITE)) + "** atualizado — " + n + " commit" + (n > 1 ? "s" : "") + " publicado" + (n > 1 ? "s" : "") + ".",
          date: it.date, origin: "github", key: it.key, repoKey: REPO_SITE
        };
      }
      return it;
    });
  }

  // traduz mensagens de commit do painel admin em itens amigáveis do feed
  function adminCommitItem(msg) {
    msg = String(msg || "").split("\n")[0].trim();
    var m;
    if ((m = msg.match(/^post:\s*(.+)/i))) {
      return { tag: "Blog", text: "Post publicado ou atualizado no blog: **" + mdSafe(m[1]) + "**.", key: "post|" + m[1] };
    }
    if ((m = msg.match(/^projetos?:\s*(.+)/i))) {
      return { tag: "Status", text: "Vitrine de projetos do site atualizada (" + mdSafe(m[1]) + ").", key: "proj|" + m[1] };
    }
    if ((m = msg.match(/^downloads?:\s*(.+)/i))) {
      return { tag: "Status", text: "Página de downloads atualizada (" + mdSafe(m[1]) + ").", key: "dl|" + m[1] };
    }
    if (/^textos?:/i.test(msg)) {
      return { tag: "Status", text: "Textos do site atualizados pelo painel administrativo.", key: "textos" };
    }
    if (/^feed:/i.test(msg) || /^blog:/i.test(msg)) return null; // acompanham outras ações; seriam ruído
    return null; // commit comum: entra na contagem genérica de código
  }

  // transforma a lista de repositórios em itens "novo projeto" do feed
  function normalizeRepos(repos) {
    (repos || []).forEach(function (r) {
      if (r && r.name && r.language) LANGS[r.name] = r.language;
    });
    var limite = Date.now() - 90 * 86400000; // últimos 90 dias
    return (repos || [])
      .filter(function (r) { return r && !r.fork && r.created_at && new Date(r.created_at).getTime() > limite; })
      .slice(0, 5)
      .map(function (r) {
        var repo = mdSafe(prettyRepo(r.name));
        var desc = r.description ? " — " + mdSafe(r.description) : "";
        return {
          tag: "Repo",
          text: "Novo projeto no GitHub: **" + repo + "**" + desc + ".",
          date: r.created_at,
          origin: "github",
          key: "new|" + r.name,
          repoKey: r.name
        };
      });
  }

  // dia no fuso do visitante (alinha o agrupamento com o rótulo Hoje/Ontem)
  function diaLocal(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || "").slice(0, 10);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  // neutraliza caracteres que quebrariam a formatação Markdown do feed
  function mdSafe(s) {
    return String(s || "").replace(/[\\`*_\[\]()<>#]/g, "\\$&");
  }

  // ícone e etiquetas de cada categoria do feed (estilo do painel)
  function feedMeta(tag, repoKey) {
    var lang = repoKey && LANGS[repoKey] ? LANGS[repoKey] : null;
    switch (tag) {
      case "Curiosidade": return { icon: "💡", tags: ["Lâmpada", "Curiosidade"], cls: "t-amber" };
      case "Status":      return { icon: "🖥️", tags: ["Chip", "Status"],        cls: "t-green" };
      case "Release":     return { icon: "🚀", tags: ["Release", "Status"],      cls: "t-green" };
      case "Código":      return { icon: "🛠️", tags: [lang || "Código", "Software"], cls: "t-blue" };
      case "Repo":        return { icon: "📦", tags: ["Repo", lang || "Novidade"], cls: "t-blue" };
      case "Blog":        return { icon: "📝", tags: ["Blog", "Novidade"],       cls: "t-orange" };
      default:            return { icon: "✨", tags: [tag],                       cls: "t-amber" };
    }
  }

  // "Hoje", "Ontem", "N dias atrás" ou data curta
  function feedWhen(ts) {
    if (!ts) return "";
    var dias = Math.floor((Date.now() - ts) / 86400000);
    if (dias <= 0) return "Hoje";
    if (dias === 1) return "Ontem";
    if (dias < 30) return dias + " dias atrás";
    var d = new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
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

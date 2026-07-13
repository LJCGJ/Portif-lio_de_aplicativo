/* admin.js — painel de administração.
 *
 * Como funciona: você entra com um token fine-grained do GitHub (permissão
 * Contents: read/write só neste repositório). Cada "Salvar e publicar" grava
 * o arquivo correspondente via API do GitHub (um commit no branch main).
 * O GitHub Actions detecta o push e republica o site sozinho.
 *
 * O token nunca vai para nenhum servidor além do próprio GitHub, e fica
 * guardado só neste navegador (sessionStorage; localStorage se você marcar
 * "continuar conectado").
 */
(function () {
  "use strict";

  /* ===== configuração do repositório ===== */
  var OWNER = "LJCGJ";
  var REPO = "Portif-lio_de_aplicativo";
  var BRANCH = "main";
  // Onde fica o site dentro do repo (pasta publicada no Pages):
  var ROOT = "frontend/";

  var API = "https://api.github.com";
  var TOKEN_KEY = "admin-token";

  /* ===== Entrar com Microsoft (opcional) =====
   * Preencha os dois campos abaixo para trocar o login por token pelo
   * "Entrar com Microsoft" (com Authenticator). Guia completo: worker/README.md
   * Deixe vazios para continuar no modo token. */
  var AUTH = {
    workerUrl: "https://painel-ljcgj.colegial505.workers.dev",
    msClientId: "a902d627-13c6-4014-9032-a9773e47c578"
  };
  var MS_MODE = !!(AUTH.workerUrl && AUTH.msClientId);
  var MSAL_CDN = "https://alcdn.msauth.net/browser/2.38.1/js/msal-browser.min.js";
  var MS_SCOPES = ["openid", "profile", "email"];
  var msalApp = null;

  var state = {
    token: null,
    user: null,
    msAccount: null,
    posts: null,      // {json, sha}
    projects: null,
    downloads: null,
    site: null,
    editingPost: null,     // slug ou null (novo)
    editingProject: null,  // índice ou null
    editingDownload: null  // índice ou null
  };

  /* ======================= util ======================= */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function setStatus(id, kind, msg) {
    var el = $(id);
    if (!el) return;
    el.className = "status show " + kind;
    el.textContent = msg;
    if (kind === "ok") setTimeout(function () { el.className = "status"; }, 6000);
  }

  // base64 <-> texto UTF-8 (sem estourar a pilha em arquivos grandes)
  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function slugify(s) {
    return String(s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /* ======================= API (GitHub direto ou via Worker) ======================= */
  function authHeader() {
    if (!MS_MODE) return Promise.resolve("Bearer " + state.token);
    return getMsIdToken().then(function (t) { return "Bearer " + t; });
  }

  function gh(path, opts) {
    opts = opts || {};
    var base = MS_MODE ? AUTH.workerUrl.replace(/\/+$/, "") : API;
    return authHeader().then(function (auth) {
      // Em modo Microsoft, o Worker ("guardião") já adiciona Accept e
      // X-GitHub-Api-Version ao repassar para o GitHub — enviar menos headers
      // daqui mantém o preflight de CORS simples e à prova de bloqueio.
      var baseHeaders = MS_MODE
        ? { Authorization: auth }
        : {
            Accept: "application/vnd.github+json",
            Authorization: auth,
            "X-GitHub-Api-Version": "2022-11-28"
          };
      opts.headers = Object.assign(baseHeaders, opts.headers || {});
      return fetch(base + path, opts);
    }).then(function (r) {
      if (r.status === 401) throw new Error(MS_MODE ? "Sessão expirada — entre novamente." : "Token inválido ou expirado.");
      if (r.status === 403) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          throw new Error(b.message || "Sem permissão.");
        });
      }
      if (r.status === 404 && opts._allow404) return null;
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          throw new Error(b.message || ("Erro " + r.status));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  /* ======================= Entrar com Microsoft ======================= */
  function loadMsal() {
    if (msalApp) return Promise.resolve(msalApp);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = MSAL_CDN;
      s.onload = function () {
        try {
          msalApp = new msal.PublicClientApplication({
            auth: {
              clientId: AUTH.msClientId,
              authority: "https://login.microsoftonline.com/consumers",
              redirectUri: window.location.origin + window.location.pathname
            },
            cache: { cacheLocation: "localStorage" }
          });
          resolve(msalApp);
        } catch (e) { reject(e); }
      };
      s.onerror = function () { reject(new Error("Não consegui carregar o login da Microsoft.")); };
      document.head.appendChild(s);
    });
  }

  function getMsIdToken() {
    return loadMsal().then(function (app) {
      var accounts = app.getAllAccounts();
      if (!accounts.length) throw new Error("Sessão expirada — entre novamente.");
      return app.acquireTokenSilent({ scopes: MS_SCOPES, account: accounts[0] })
        .then(function (res) { return res.idToken; });
    });
  }

  function msLogin() {
    setStatus("login-status", "busy", "Abrindo o login da Microsoft…");
    return loadMsal().then(function (app) {
      return app.loginPopup({ scopes: MS_SCOPES, prompt: "select_account" });
    }).then(function (res) {
      state.msAccount = res.account;
      return verify();
    });
  }

  function loadFile(path) {
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + encodeURIComponent(ROOT + path).replace(/%2F/g, "/") + "?ref=" + BRANCH, { _allow404: true })
      .then(function (res) {
        if (!res) return null;
        return { text: b64decode(res.content), sha: res.sha };
      });
  }

  function saveFile(path, text, sha, message) {
    var body = {
      message: message,
      content: b64encode(text),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + (ROOT + path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }

  function deleteFile(path, sha, message) {
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + (ROOT + path), {
      method: "DELETE",
      body: JSON.stringify({ message: message, sha: sha, branch: BRANCH })
    });
  }

  /* ======================= login ======================= */
  function tryStoredToken() {
    if (MS_MODE) {
      return loadMsal().then(function (app) {
        var accounts = app.getAllAccounts();
        if (!accounts.length) return Promise.reject();
        state.msAccount = accounts[0];
        return verify();
      });
    }
    var t = null;
    try { t = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch (e) {}
    if (t) { state.token = t; return verify(); }
    return Promise.reject();
  }

  function verify() {
    return gh("/user").then(function (u) {
      state.user = u;
      // confirma acesso de escrita ao repo
      return gh("/repos/" + OWNER + "/" + REPO).then(function (repo) {
        if (!repo.permissions || !repo.permissions.push) {
          throw new Error("O token não tem permissão de escrita neste repositório.");
        }
      });
    });
  }

  function showLogin() {
    $("login-view").hidden = false;
    $("admin-view").hidden = true;
    $("ms-login-block").hidden = !MS_MODE;
    $("token-login-block").hidden = MS_MODE;
  }

  function showAdmin() {
    $("login-view").hidden = true;
    $("admin-view").hidden = false;
    var who = MS_MODE && state.msAccount
      ? (state.msAccount.username || state.msAccount.name || "?")
      : (state.user && state.user.login) || "?";
    $("admin-who").textContent = "conectado como " + who + " · " + OWNER + "/" + REPO;
    loadAll();
  }

  /* ======================= carregar dados ======================= */
  function loadAll() {
    setStatus("posts-status", "busy", "Carregando dados do repositório…");
    Promise.all([
      loadFile("posts/posts.json"),
      loadFile("data/projects.json"),
      loadFile("data/downloads.json"),
      loadFile("data/site.json")
    ]).then(function (r) {
      state.posts     = parseStore(r[0], []);
      state.projects  = parseStore(r[1], []);
      state.downloads = parseStore(r[2], []);
      state.site      = parseStore(r[3], { hero: {}, footer: {} });
      renderPostList();
      renderProjectList();
      renderDownloadList();
      fillTexts();
      setStatus("posts-status", "ok", "Dados carregados.");
    }).catch(function (err) {
      setStatus("posts-status", "err", err.message);
    });
  }

  function parseStore(file, fallback) {
    if (!file) return { data: fallback, sha: null };
    try { return { data: JSON.parse(file.text), sha: file.sha }; }
    catch (e) { return { data: fallback, sha: file.sha }; }
  }

  /* ======================= POSTS ======================= */
  function renderPostList() {
    var host = $("post-list");
    var posts = state.posts.data.slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    host.innerHTML = posts.length ? posts.map(function (p) {
      return '<div class="item-row">' +
        '<div class="grow"><div class="t">' + esc(p.title) + '</div>' +
        '<div class="s">' + esc(p.date) + " · " + esc(p.slug) + "</div></div>" +
        '<button class="btn btn-ghost btn-sm" data-edit-post="' + esc(p.slug) + '" type="button">Editar</button>' +
      "</div>";
    }).join("") : '<p class="s mono" style="color:var(--ink-faint)">Nenhum post ainda.</p>';

    host.querySelectorAll("[data-edit-post]").forEach(function (btn) {
      btn.addEventListener("click", function () { openPost(btn.getAttribute("data-edit-post")); });
    });
  }

  function openPost(slug) {
    var meta = state.posts.data.filter(function (p) { return p.slug === slug; })[0];
    if (!meta) return;
    state.editingPost = slug;
    $("p-title").value = meta.title || "";
    $("p-slug").value = meta.slug || "";
    $("p-slug").disabled = true; // slug fixo ao editar (é o nome do arquivo)
    $("p-date").value = meta.date || "";
    $("p-tags").value = (meta.tags || []).join(", ");
    $("p-summary").value = meta.summary || "";
    $("p-body").value = "";
    $("btn-delete-post").hidden = false;
    $("post-editor").hidden = false;
    setStatus("posts-status", "busy", "Carregando o texto do post…");
    loadFile("posts/" + slug + ".md").then(function (f) {
      $("p-body").value = f ? f.text : "";
      $("p-body")._sha = f ? f.sha : null;
      refreshPreview();
      setStatus("posts-status", "ok", "Post carregado.");
    }).catch(function (err) { setStatus("posts-status", "err", err.message); });
  }

  function newPost() {
    state.editingPost = null;
    $("p-title").value = "";
    $("p-slug").value = "";
    $("p-slug").disabled = false;
    $("p-date").value = new Date().toISOString().slice(0, 10);
    $("p-tags").value = "";
    $("p-summary").value = "";
    $("p-body").value = "# Título\n\nEscreva aqui em **Markdown**.";
    $("p-body")._sha = null;
    $("btn-delete-post").hidden = true;
    $("post-editor").hidden = false;
    refreshPreview();
  }

  function savePost() {
    var slug = state.editingPost || slugify($("p-slug").value || $("p-title").value);
    if (!slug) { setStatus("posts-status", "err", "Defina um slug (nome do arquivo)."); return; }
    if (!$("p-title").value.trim()) { setStatus("posts-status", "err", "O post precisa de um título."); return; }

    var meta = {
      slug: slug,
      title: $("p-title").value.trim(),
      date: $("p-date").value || new Date().toISOString().slice(0, 10),
      tags: $("p-tags").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      summary: $("p-summary").value.trim()
    };

    // atualiza/insere no índice
    var list = state.posts.data;
    var idx = -1;
    list.forEach(function (p, i) { if (p.slug === slug) idx = i; });
    if (idx >= 0) list[idx] = meta; else list.push(meta);

    setStatus("posts-status", "busy", "Publicando… (1/2: texto do post)");
    saveFile("posts/" + slug + ".md", $("p-body").value, $("p-body")._sha, "post: " + meta.title)
      .then(function (res) {
        $("p-body")._sha = res.content.sha;
        setStatus("posts-status", "busy", "Publicando… (2/2: índice do blog)");
        return saveFile("posts/posts.json", JSON.stringify(list, null, 2) + "\n", state.posts.sha, "blog: atualiza índice (" + slug + ")");
      })
      .then(function (res) {
        state.posts.sha = res.content.sha;
        state.editingPost = slug;
        $("p-slug").disabled = true;
        $("btn-delete-post").hidden = false;
        renderPostList();
        setStatus("posts-status", "ok", "Publicado! O site atualiza em 1–2 minutos.");
      })
      .catch(function (err) { setStatus("posts-status", "err", err.message); });
  }

  function deletePost() {
    var slug = state.editingPost;
    if (!slug) return;
    if (!confirm('Excluir o post "' + slug + '"? Isso remove o arquivo do site.')) return;

    var list = state.posts.data.filter(function (p) { return p.slug !== slug; });
    setStatus("posts-status", "busy", "Excluindo…");
    var mdDelete = $("p-body")._sha
      ? deleteFile("posts/" + slug + ".md", $("p-body")._sha, "post: exclui " + slug)
      : Promise.resolve();
    mdDelete
      .then(function () {
        return saveFile("posts/posts.json", JSON.stringify(list, null, 2) + "\n", state.posts.sha, "blog: remove " + slug + " do índice");
      })
      .then(function (res) {
        state.posts.data = list;
        state.posts.sha = res.content.sha;
        $("post-editor").hidden = true;
        renderPostList();
        setStatus("posts-status", "ok", "Post excluído.");
      })
      .catch(function (err) { setStatus("posts-status", "err", err.message); });
  }

  var previewTimer;
  function refreshPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      window.MdEngine.ready.then(function (engine) {
        $("p-preview").innerHTML = engine.render($("p-body").value);
      });
    }, 120);
  }

  /* ======================= PROJETOS ======================= */
  function renderProjectList() {
    var host = $("project-list");
    var list = state.projects.data;
    host.innerHTML = list.length ? list.map(function (p, i) {
      return '<div class="item-row">' +
        '<div class="grow"><div class="t">' + esc(p.title) + (p.featured ? ' <span class="tag">destaque</span>' : "") + (p.carousel ? ' <span class="tag">carrossel' + (p.order ? " #" + p.order : "") + '</span>' : "") + '</div>' +
        '<div class="s">' + esc(p.kicker || "") + "</div></div>" +
        '<button class="btn btn-ghost btn-sm" data-i="' + i + '" data-mv="-1" type="button" ' + (i === 0 ? "disabled" : "") + '>↑</button>' +
        '<button class="btn btn-ghost btn-sm" data-i="' + i + '" data-mv="1" type="button" ' + (i === list.length - 1 ? "disabled" : "") + '>↓</button>' +
        '<button class="btn btn-ghost btn-sm" data-edit-project="' + i + '" type="button">Editar</button>' +
      "</div>";
    }).join("") : '<p class="s mono" style="color:var(--ink-faint)">Nenhum projeto ainda.</p>';

    host.querySelectorAll("[data-edit-project]").forEach(function (btn) {
      btn.addEventListener("click", function () { openProject(+btn.getAttribute("data-edit-project")); });
    });
    host.querySelectorAll("[data-mv]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = +btn.getAttribute("data-i"), d = +btn.getAttribute("data-mv");
        var l = state.projects.data;
        var tmp = l[i]; l[i] = l[i + d]; l[i + d] = tmp;
        saveProjects("projetos: reordena");
      });
    });
  }

  function openProject(i) {
    var p = state.projects.data[i];
    if (!p) return;
    state.editingProject = i;
    $("pr-title").value = p.title || "";
    $("pr-kicker").value = p.kicker || "";
    $("pr-desc").value = p.desc || "";
    $("pr-tags").value = (p.tags || []).join(", ");
    $("pr-featured").value = p.featured ? "true" : "false";
    $("pr-carousel").value = p.carousel ? "true" : "false";
    $("pr-order").value = p.order || "";
    var code = "", dl = "";
    (p.actions || []).forEach(function (a) {
      if (a.style === "primary") dl = a.href; else code = a.href;
    });
    $("pr-code").value = code;
    $("pr-download").value = dl;
    $("btn-delete-project").hidden = false;
    $("project-editor").hidden = false;
  }

  function newProject() {
    state.editingProject = null;
    ["pr-title", "pr-kicker", "pr-desc", "pr-tags", "pr-code", "pr-download", "pr-order"].forEach(function (id) { $(id).value = ""; });
    $("pr-featured").value = "false";
    $("pr-carousel").value = "true";
    $("btn-delete-project").hidden = true;
    $("project-editor").hidden = false;
  }

  function collectProject() {
    var actions = [];
    if ($("pr-download").value.trim()) {
      actions.push({ label: "Baixar ↓", href: $("pr-download").value.trim(), style: "primary" });
    }
    if ($("pr-code").value.trim()) {
      actions.push({ label: "Código ↗", href: $("pr-code").value.trim(), style: "ghost", external: true });
    }
    return {
      featured: $("pr-featured").value === "true",
      carousel: $("pr-carousel").value === "true",
      order: parseInt($("pr-order").value, 10) || undefined,
      kicker: $("pr-kicker").value.trim(),
      title: $("pr-title").value.trim(),
      desc: $("pr-desc").value.trim(),
      tags: $("pr-tags").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      actions: actions
    };
  }

  function saveProject() {
    if (!$("pr-title").value.trim()) { setStatus("projects-status", "err", "O projeto precisa de um nome."); return; }
    var p = collectProject();
    if (state.editingProject == null) state.projects.data.push(p);
    else state.projects.data[state.editingProject] = p;
    saveProjects("projetos: " + p.title, function () { $("project-editor").hidden = true; });
  }

  function deleteProject() {
    if (state.editingProject == null) return;
    var p = state.projects.data[state.editingProject];
    if (!confirm('Excluir o projeto "' + p.title + '"?')) return;
    state.projects.data.splice(state.editingProject, 1);
    saveProjects("projetos: remove " + p.title, function () { $("project-editor").hidden = true; });
  }

  function saveProjects(message, after) {
    setStatus("projects-status", "busy", "Publicando…");
    saveFile("data/projects.json", JSON.stringify(state.projects.data, null, 2) + "\n", state.projects.sha, message)
      .then(function (res) {
        state.projects.sha = res.content.sha;
        renderProjectList();
        if (after) after();
        setStatus("projects-status", "ok", "Publicado! O site atualiza em 1–2 minutos.");
      })
      .catch(function (err) {
        setStatus("projects-status", "err", err.message);
        loadAll(); // ressincroniza em caso de conflito de sha
      });
  }

  /* ======================= DOWNLOADS ======================= */
  function renderDownloadList() {
    var host = $("download-list");
    var list = state.downloads.data;
    host.innerHTML = list.length ? list.map(function (d, i) {
      return '<div class="item-row">' +
        '<div class="grow"><div class="t">' + esc(d.name) + '</div>' +
        '<div class="s">' + esc(d.url ? "Google Drive / link direto" : (d.repo || "sem fonte definida")) + "</div></div>" +
        '<button class="btn btn-ghost btn-sm" data-edit-download="' + i + '" type="button">Editar</button>' +
      "</div>";
    }).join("") : '<p class="s mono" style="color:var(--ink-faint)">Nenhum item ainda.</p>';

    host.querySelectorAll("[data-edit-download]").forEach(function (btn) {
      btn.addEventListener("click", function () { openDownload(+btn.getAttribute("data-edit-download")); });
    });
  }

  function openDownload(i) {
    var d = state.downloads.data[i];
    if (!d) return;
    state.editingDownload = i;
    $("d-name").value = d.name || "";
    $("d-platform").value = d.platform || "";
    $("d-desc").value = d.desc || "";
    $("d-url").value = d.url || "";
    $("d-version").value = d.version || "";
    $("d-repo").value = d.repo || "";
    $("d-req").value = d.requirements || "";
    $("d-notes").value = d.notes || "";
    $("btn-delete-download").hidden = false;
    $("download-editor").hidden = false;
  }

  function newDownload() {
    state.editingDownload = null;
    ["d-name", "d-platform", "d-desc", "d-url", "d-version", "d-repo", "d-req", "d-notes"].forEach(function (id) { $(id).value = ""; });
    $("btn-delete-download").hidden = true;
    $("download-editor").hidden = false;
  }

  function saveDownload() {
    if (!$("d-name").value.trim()) { setStatus("downloads-status", "err", "O item precisa de um nome."); return; }
    var d = {
      id: state.editingDownload != null ? state.downloads.data[state.editingDownload].id : slugify($("d-name").value),
      name: $("d-name").value.trim(),
      desc: $("d-desc").value.trim(),
      platform: $("d-platform").value.trim(),
      url: $("d-url").value.trim(),
      version: $("d-version").value.trim(),
      repo: $("d-repo").value.trim(),
      requirements: $("d-req").value.trim(),
      notes: $("d-notes").value.trim()
    };
    if (state.editingDownload == null) state.downloads.data.push(d);
    else state.downloads.data[state.editingDownload] = d;
    saveDownloads("downloads: " + d.name, function () { $("download-editor").hidden = true; });
  }

  function deleteDownload() {
    if (state.editingDownload == null) return;
    var d = state.downloads.data[state.editingDownload];
    if (!confirm('Excluir "' + d.name + '" da página de downloads?')) return;
    state.downloads.data.splice(state.editingDownload, 1);
    saveDownloads("downloads: remove " + d.name, function () { $("download-editor").hidden = true; });
  }

  function saveDownloads(message, after) {
    setStatus("downloads-status", "busy", "Publicando…");
    saveFile("data/downloads.json", JSON.stringify(state.downloads.data, null, 2) + "\n", state.downloads.sha, message)
      .then(function (res) {
        state.downloads.sha = res.content.sha;
        renderDownloadList();
        if (after) after();
        setStatus("downloads-status", "ok", "Publicado! O site atualiza em 1–2 minutos.");
      })
      .catch(function (err) {
        setStatus("downloads-status", "err", err.message);
        loadAll();
      });
  }

  /* ======================= TEXTOS ======================= */
  function fillTexts() {
    var s = state.site.data;
    $("t-eyebrow").value = (s.hero && s.hero.eyebrow) || "";
    $("t-title").value = (s.hero && s.hero.title_html) || "";
    $("t-lead").value = (s.hero && s.hero.lead) || "";
    $("t-btn-primary").value = (s.hero && s.hero.btn_primary) || "";
    $("t-btn-github").value = (s.hero && s.hero.btn_github) || "";
    $("t-sec-featured").value = (s.sections && s.sections.featured_title) || "";
    $("t-sec-projects").value = (s.sections && s.sections.projects_title) || "";
    $("t-sec-blog").value = (s.sections && s.sections.blog_title) || "";
    $("t-footer-note").value = (s.footer && s.footer.note) || "";
    $("t-who").value = (s.footer && s.footer.who) || "";
    $("t-meta").value = (s.footer && s.footer.meta) || "";
  }

  function saveTexts() {
    var s = {
      hero: {
        eyebrow: $("t-eyebrow").value.trim(),
        title_html: $("t-title").value.trim(),
        lead: $("t-lead").value.trim(),
        btn_primary: $("t-btn-primary").value.trim(),
        btn_github: $("t-btn-github").value.trim()
      },
      sections: {
        featured_title: $("t-sec-featured").value.trim(),
        projects_title: $("t-sec-projects").value.trim(),
        blog_title: $("t-sec-blog").value.trim()
      },
      footer: {
        who: $("t-who").value.trim(),
        meta: $("t-meta").value.trim(),
        note: $("t-footer-note").value.trim()
      }
    };
    state.site.data = s;
    setStatus("texts-status", "busy", "Publicando…");
    saveFile("data/site.json", JSON.stringify(s, null, 2) + "\n", state.site.sha, "textos: atualiza home")
      .then(function (res) {
        state.site.sha = res.content.sha;
        setStatus("texts-status", "ok", "Publicado! O site atualiza em 1–2 minutos.");
      })
      .catch(function (err) {
        setStatus("texts-status", "err", err.message);
        loadAll();
      });
  }

  /* ======================= boot ======================= */
  document.addEventListener("DOMContentLoaded", function () {
    // login
    $("btn-login").addEventListener("click", function () {
      var t = $("token").value.trim();
      if (!t) { setStatus("login-status", "err", "Cole o token para entrar."); return; }
      state.token = t;
      setStatus("login-status", "busy", "Verificando…");
      verify().then(function () {
        try {
          sessionStorage.setItem(TOKEN_KEY, t);
          if ($("remember").checked) localStorage.setItem(TOKEN_KEY, t);
        } catch (e) {}
        showAdmin();
      }).catch(function (err) {
        setStatus("login-status", "err", err.message || "Não consegui entrar.");
      });
    });
    $("token").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("btn-login").click();
    });

    var msBtn = $("btn-ms-login");
    if (msBtn) {
      msBtn.addEventListener("click", function () {
        msLogin().then(showAdmin).catch(function (err) {
          if (err && /user_cancelled|popup_window/i.test(err.errorCode || "")) {
            setStatus("login-status", "err", "Login cancelado.");
          } else {
            setStatus("login-status", "err", (err && err.message) || "Não consegui entrar.");
          }
        });
      });
    }

    $("btn-logout").addEventListener("click", function () {
      try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      state.token = null;
      state.msAccount = null;
      if (MS_MODE && msalApp) {
        msalApp.logoutPopup({ account: msalApp.getAllAccounts()[0] }).catch(function () {});
      }
      showLogin();
    });

    // abas
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", "false"); });
        document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
        tab.setAttribute("aria-selected", "true");
        $("panel-" + tab.getAttribute("data-tab")).classList.add("active");
      });
    });

    // posts
    $("btn-new-post").addEventListener("click", newPost);
    $("btn-save-post").addEventListener("click", savePost);
    $("btn-cancel-post").addEventListener("click", function () { $("post-editor").hidden = true; });
    $("btn-delete-post").addEventListener("click", deletePost);
    $("p-body").addEventListener("input", refreshPreview);

    // projetos
    $("btn-new-project").addEventListener("click", newProject);
    $("btn-save-project").addEventListener("click", saveProject);
    $("btn-cancel-project").addEventListener("click", function () { $("project-editor").hidden = true; });
    $("btn-delete-project").addEventListener("click", deleteProject);

    // downloads
    $("btn-new-download").addEventListener("click", newDownload);
    $("btn-save-download").addEventListener("click", saveDownload);
    $("btn-cancel-download").addEventListener("click", function () { $("download-editor").hidden = true; });
    $("btn-delete-download").addEventListener("click", deleteDownload);

    // textos
    $("btn-save-texts").addEventListener("click", saveTexts);

    // sessão guardada?
    tryStoredToken().then(showAdmin).catch(showLogin);
  });
})();

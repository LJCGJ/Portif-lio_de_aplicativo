/* downloads.js — página de downloads.
 * Lê data/downloads.json e, para cada app com "repo", consulta a API pública
 * do GitHub (releases/latest) para descobrir o arquivo do release mais
 * recente. O botão baixa o arquivo DIRETO (browser_download_url) — o
 * visitante não é levado para a página do GitHub.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var host = document.getElementById("downloads-list");
    if (!host) return;

    fetch("data/downloads.json")
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (!items.length) {
          host.innerHTML = '<p class="mono" style="color:var(--ink-faint)">Nenhum download disponível ainda.</p>';
          return;
        }
        host.innerHTML = items.map(skeleton).join("");
        items.forEach(hydrate);
      })
      .catch(function () {
        host.innerHTML = '<p class="mono">Não consegui carregar a lista de downloads.</p>';
      });
  });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function skeleton(item) {
    return (
      '<article class="card" id="dl-' + esc(item.id) + '">' +
        '<p class="kicker">' + esc(item.platform || "Download") + "</p>" +
        "<h3>" + esc(item.name) + "</h3>" +
        '<p class="desc">' + esc(item.desc || "") + "</p>" +
        (item.requirements ? '<p class="desc" style="font-size:0.85rem"><strong>Requisitos:</strong> ' + esc(item.requirements) + "</p>" : "") +
        '<div class="tags" data-role="meta"><span class="tag">procurando versão…</span></div>' +
        '<div class="card-actions" data-role="actions">' +
          '<span class="btn btn-ghost" aria-disabled="true" style="opacity:.6;cursor:default">Verificando…</span>' +
        "</div>" +
        (item.notes ? '<p class="engine-cap" style="margin-top:0.9rem">' + esc(item.notes) + "</p>" : "") +
      "</article>"
    );
  }

  function hydrate(item) {
    var card = document.getElementById("dl-" + item.id);
    if (!card) return;
    var actions = card.querySelector('[data-role="actions"]');
    var meta = card.querySelector('[data-role="meta"]');

    // 1ª prioridade: link manual (Google Drive ou qualquer URL) definido no painel
    if (item.url) {
      var isDrive = /drive\.google\.com|docs\.google\.com/.test(item.url);
      var tags = [];
      if (item.version) tags.push('<span class="tag">' + esc(item.version) + "</span>");
      tags.push('<span class="tag">' + (isDrive ? "Google Drive" : "download externo") + "</span>");
      meta.innerHTML = tags.join("");
      actions.innerHTML =
        '<a class="btn btn-primary" href="' + esc(item.url) + '" target="_blank" rel="noopener">' +
        (isDrive ? "Baixar no Google Drive ↗" : "Baixar ↓") + "</a>";
      return;
    }

    if (!item.repo) {
      // download hospedado no próprio site (assets/)
      if (item.file) {
        actions.innerHTML = btn(item.file, "Baixar ↓", true);
        meta.innerHTML = "";
      } else {
        actions.innerHTML = '<span class="tag">em breve</span>';
        meta.innerHTML = "";
      }
      return;
    }

    fetch("https://api.github.com/repos/" + item.repo + "/releases/latest", {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (r) {
        if (!r.ok) throw new Error("sem release (" + r.status + ")");
        return r.json();
      })
      .then(function (rel) {
        var assets = rel.assets || [];
        // prefere instalador (.exe/.msi), depois .zip, senão o primeiro
        var asset =
          pick(assets, /\.(exe|msi)$/i) ||
          pick(assets, /\.zip$/i) ||
          assets[0];

        if (!asset) throw new Error("release sem arquivos anexados");

        meta.innerHTML =
          '<span class="tag">' + esc(rel.tag_name || "versão") + "</span>" +
          '<span class="tag">' + fmtSize(asset.size) + "</span>" +
          '<span class="tag">' + esc(asset.name) + "</span>";

        actions.innerHTML =
          btn(asset.browser_download_url, "Baixar " + esc(rel.tag_name || "") + " ↓", true) +
          (rel.html_url ? ' <a class="btn btn-ghost" href="' + esc(rel.html_url) + '" target="_blank" rel="noopener">Notas da versão ↗</a>' : "");
      })
      .catch(function (err) {
        meta.innerHTML = '<span class="tag">nenhum release publicado ainda</span>';
        actions.innerHTML =
          '<a class="btn btn-ghost" href="https://github.com/' + esc(item.repo) + '" target="_blank" rel="noopener">Ver repositório ↗</a>';
        console.warn("[downloads]", item.id, err.message);
      });
  }

  function pick(assets, re) {
    for (var i = 0; i < assets.length; i++) {
      if (re.test(assets[i].name)) return assets[i];
    }
    return null;
  }

  function btn(href, label, download) {
    return '<a class="btn btn-primary" href="' + esc(href) + '"' + (download ? ' download' : '') + ">" + label + "</a>";
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    var mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB";
  }
})();

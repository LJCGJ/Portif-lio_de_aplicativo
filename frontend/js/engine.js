/* engine.js
 * Camada de acesso ao motor de Markdown.
 * - Se frontend/wasm/md.js (compilado do C++) existir, usa o motor WASM.
 * - Se não existir (ex.: rodando local antes de compilar), usa um
 *   renderizador Markdown mínimo em JS, pra nada quebrar.
 *
 * API:  const engine = await MdEngine.ready;
 *       engine.render(markdownString) -> htmlString
 *       engine.name  -> string ("md.wasm ..." ou "fallback JS ...")
 *       engine.wasm  -> boolean
 */
(function () {
  "use strict";

  var WASM_LOADER = "wasm/md.js"; // relativo à raiz do site (todas as páginas ficam na raiz)

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("não foi possível carregar " + src)); };
      document.head.appendChild(s);
    });
  }

  async function initWasm() {
    await loadScript(WASM_LOADER);
    if (typeof createMdEngine !== "function") {
      throw new Error("createMdEngine ausente");
    }
    var mod = await createMdEngine();
    function render(md) {
      var ptr = mod.ccall("md_render", "number", ["string"], [md || ""]);
      if (!ptr) return "";
      var html = mod.UTF8ToString(ptr);
      mod.ccall("md_free", null, ["number"], [ptr]);
      return html;
    }
    return { render: render, name: "md.wasm · C++ \u2192 WebAssembly", wasm: true };
  }

  var ready = initWasm().catch(function (err) {
    console.warn("[engine] WASM indisponível, usando fallback JS:", err.message);
    return {
      render: fallbackMarkdown,
      name: "fallback JS (md.wasm ainda não compilado)",
      wasm: false
    };
  });

  window.MdEngine = { ready: ready };

  /* ---------------------------------------------------------------------- *
   * Fallback: renderizador Markdown mínimo em JS.                          *
   * Cobre o suficiente para pré-visualizar posts localmente. No deploy     *
   * (GitHub Pages) quem renderiza é o motor C++/WASM.                      *
   * ---------------------------------------------------------------------- */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inline(s) {
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      codes.push("<code>" + c + "</code>");
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
    return s;
  }

  function fallbackMarkdown(src) {
    src = String(src || "").replace(/\r\n?/g, "\n");
    var lines = src.split("\n");
    var out = "";
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // bloco de código cercado ```
      var fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        var code = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; // pula o fechamento
        out += "<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>\n";
        continue;
      }

      // linha em branco
      if (/^\s*$/.test(line)) { i++; continue; }

      // título
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        out += "<h" + lvl + ">" + inline(escapeHtml(h[2])) + "</h" + lvl + ">\n";
        i++; continue;
      }

      // régua horizontal
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out += "<hr>\n"; i++; continue; }

      // citação
      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
        out += "<blockquote>" + fallbackMarkdown(quote.join("\n")) + "</blockquote>\n";
        continue;
      }

      // lista (ul / ol)
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        var ordered = /^\s*\d+\.\s+/.test(line);
        var items = [];
        while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
          var item = lines[i].replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
          item = item.replace(/^\[( |x|X)\]\s+/, function (_, c) {
            return c.toLowerCase() === "x" ? "\u2611 " : "\u2610 ";
          });
          items.push("<li>" + inline(escapeHtml(item)) + "</li>");
          i++;
        }
        out += (ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>") + "\n";
        continue;
      }

      // parágrafo (linhas consecutivas)
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) &&
             !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out += "<p>" + inline(escapeHtml(para.join(" "))) + "</p>\n";
    }

    return out;
  }
})();

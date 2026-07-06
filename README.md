# Portfólio + Blog — Leonardo Gonzaga (LJCGJ)

Site estático (portfólio + blog) hospedado no **GitHub Pages**. O diferencial:
o motor que renderiza o Markdown dos posts é escrito em **C++** e compilado
para **WebAssembly**, rodando no navegador.

```
.
├── frontend/            <- o site (é isto que o GitHub Pages publica)
│   ├── index.html       .. home: portfólio + playground do motor ao vivo
│   ├── blog.html        .. lista de posts
│   ├── post.html        .. um post (post.html?slug=...)
│   ├── css/style.css
│   ├── js/
│   │   ├── engine.js    .. carrega o WASM (ou usa fallback JS de Markdown)
│   │   ├── main.js      .. tema, playground, últimos posts
│   │   └── blog.js      .. lista e leitura de posts
│   ├── posts/
│   │   ├── posts.json   .. índice dos posts
│   │   └── *.md         .. um arquivo por post
│   ├── wasm/            .. md.js + md.wasm (gerados no build; não versionados)
│   └── assets/          .. favicon, imagens, instaladores
│
├── backend/             <- o "backend": motor de Markdown em C++
│   ├── src/
│   │   ├── md_engine.cpp .. wrapper C++ (expõe md_render / md_free)
│   │   └── md4c*.{c,h}   .. parser CommonMark (md4c, MIT)
│   ├── build.sh         .. build no Linux/macOS/msys2
│   └── build.ps1        .. build no Windows
│
└── .github/workflows/deploy.yml  <- compila o WASM e publica no Pages
```

## Publicar (uma vez só)

1. Suba os arquivos para o repositório no branch `main`.
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. A cada `push` no `main`, o Actions compila o C++ para WASM e publica o site.

O endereço fica em `https://LJCGJ.github.io/Portif-lio_de_aplicativo/`.

## Rodar localmente

O `wasm/md.js` só existe depois do build, então localmente o site usa o
renderizador JS de reserva — tudo funciona igual, só o motor que muda.
Sirva a pasta `frontend/` por HTTP (abrir o arquivo direto não funciona por
causa do `fetch`):

```bash
cd frontend
python3 -m http.server 8000
# abra http://localhost:8000
```

Quer o motor C++ de verdade localmente? Instale o
[Emscripten](https://emscripten.org/docs/getting_started/downloads.html) e rode
`backend/build.sh` (ou `backend/build.ps1` no Windows) antes de servir.

## Escrever um post

1. Crie `frontend/posts/meu-post.md` (só Markdown, sem HTML cru).
2. Adicione uma entrada em `frontend/posts/posts.json`:

```json
{
  "slug": "meu-post",
  "title": "Título do post",
  "date": "2026-07-10",
  "tags": ["C++", "notas"],
  "summary": "Uma frase de resumo."
}
```

O `slug` tem que bater com o nome do arquivo (`meu-post` → `meu-post.md`).

## Adicionar um projeto / o download do Limpador

- Projetos ficam em `frontend/index.html`, na seção `#projetos`. Duplique um
  `<article class="card">` e edite. Os pontos de ajuste estão comentados.
- O botão de download do Limpador já aponta para
  `github.com/LJCGJ/Limpador_arquivos/releases/latest`. Crie um **Release** com o
  instalador anexado e o botão passa a baixá-lo direto.

## Créditos

Parser de Markdown: [md4c](https://github.com/mity/md4c) (MIT) — ver
`backend/src/md4c-LICENSE.md`.

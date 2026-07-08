# backend — motor de Markdown em C++

Este é o "backend" do site: um motor que converte **Markdown → HTML**, escrito
em C++ e compilado para **WebAssembly**. Ele roda no navegador (não há servidor).

## Peças

- `src/md_engine.cpp` — wrapper em C++. Expõe duas funções ao JavaScript:
  - `char* md_render(const char* markdown)` — devolve HTML (alocado com `malloc`)
  - `void  md_free(char* ptr)` — libera o ponteiro devolvido acima
- `src/md4c*.{c,h}` — o [md4c](https://github.com/mity/md4c), parser CommonMark
  em C (licença MIT, em `src/md4c-LICENSE.md`).

Usa o dialeto GitHub (tabelas, `~~strike~~`, listas de tarefas, autolinks) e
ignora HTML cru na entrada — então o playground da home é seguro.

## Compilar

Pré-requisito: [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
instalado e ativado (`emcc` no PATH).

```bash
# Linux / macOS / msys2
./build.sh
```

```powershell
# Windows
.\build.ps1
```

Saída: `../frontend/wasm/md.js` e `../frontend/wasm/md.wasm`.

No GitHub Pages, quem faz esse build a cada `push` é o workflow em
`.github/workflows/deploy.yml` — não é preciso ter o Emscripten na sua máquina
para publicar.

## Estender o motor

Quer que o "backend" faça mais coisa (busca nos posts, geração de índice,
realce de sintaxe)? Basta escrever a função em C++, marcá-la com
`EMSCRIPTEN_KEEPALIVE`, adicioná-la em `EXPORTED_FUNCTIONS` no script de build e
chamá-la pelo `engine.js`.

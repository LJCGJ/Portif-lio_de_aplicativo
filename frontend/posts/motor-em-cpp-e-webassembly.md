# Por que o motor deste blog é escrito em C++

Quando comecei este site, a ideia era ter um "backend em C++". Só que ele mora no **GitHub Pages**, e o Pages serve *só arquivos estáticos*: HTML, CSS, JS, imagens. Não roda processo nenhum no servidor. Um binário C++ escutando requisições simplesmente não tem onde rodar ali.

A saída foi virar a mesa: em vez de um servidor, o C++ virou o **motor que roda no navegador**, compilado para **WebAssembly**.

## O que o motor faz

Ele recebe Markdown e devolve HTML. É isso que renderiza cada post — inclusive este que você está lendo — e o playground ao vivo lá na home.

Por baixo, uso o [md4c](https://github.com/mity/md4c), um parser CommonMark em C bem rápido, com um wrapper meu em C++ por cima expondo duas funções:

```cpp
extern "C" {
  char* md_render(const char* markdown); // Markdown -> HTML
  void  md_free(char* ptr);              // libera o resultado
}
```

O `md_render` monta o HTML num `std::string` e devolve um ponteiro que o JavaScript lê e depois manda liberar com `md_free`. Simples e sem vazamento.

## Do C++ ao navegador

O build é um comando só, com o Emscripten:

```bash
emcc src/md4c.c src/entity.c src/md4c-html.c src/md_engine.cpp \
  -O3 -s MODULARIZE=1 -s EXPORT_NAME=createMdEngine \
  -o ../frontend/wasm/md.js
```

Isso gera `md.js` (a cola em JavaScript) e `md.wasm` (o binário). No navegador:

```js
const mod = await createMdEngine();
const ptr  = mod.ccall("md_render", "number", ["string"], [markdown]);
const html = mod.UTF8ToString(ptr);
mod.ccall("md_free", null, ["number"], [ptr]);
```

Quem compila isso a cada `push` é o **GitHub Actions** — então eu nem preciso ter o Emscripten na máquina pra publicar.

## E se o WASM não carregar?

Tem um plano B. Se o `md.wasm` ainda não foi compilado (por exemplo rodando o site local antes do primeiro build), um renderizador de Markdown em JavaScript assume no lugar. O site nunca aparece quebrado; só troca o motor.

> Markdown entra, HTML sai. A diferença é *quem* faz a conta: um binário em C++ que eu escrevi, rodando dentro do seu navegador.

// md_engine.cpp
// -----------------------------------------------------------------------------
// O "backend" do site: um motor de Markdown escrito em C++ (por cima do md4c,
// parser CommonMark em C) e compilado para WebAssembly com Emscripten.
//
// Ele roda no navegador. Recebe uma string Markdown e devolve HTML.
// É isso que renderiza cada post do blog e o playground ao vivo da home.
//
// Exporta duas funcoes para o JavaScript:
//   char* md_render(const char* markdown)  -> devolve HTML (alocado com malloc)
//   void  md_free(char* ptr)                -> libera o ponteiro devolvido acima
// -----------------------------------------------------------------------------

#include <cstdlib>
#include <cstring>
#include <string>

#include "md4c-html.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

// Acumulador: o md4c chama esta funcao em pedacos conforme gera o HTML.
struct OutputBuffer {
    std::string html;
};

void append_output(const MD_CHAR* data, MD_SIZE size, void* userdata) {
    OutputBuffer* buf = static_cast<OutputBuffer*>(userdata);
    buf->html.append(data, size);
}

}  // namespace

extern "C" {

// Renderiza Markdown -> HTML.
// Retorna um char* terminado em '\0' alocado com malloc.
// O chamador (JavaScript) DEVE liberar com md_free().
EMSCRIPTEN_KEEPALIVE
char* md_render(const char* input) {
    if (input == nullptr) {
        char* empty = static_cast<char*>(std::malloc(1));
        if (empty) empty[0] = '\0';
        return empty;
    }

    OutputBuffer buffer;

    // Dialeto GitHub (tabelas, ~~strike~~, listas de tarefas, autolinks, etc.)
    // + NOHTML: ignora HTML cru na entrada. Isso mantem o playground da home
    // seguro (ninguem injeta <script> digitando no editor).
    const unsigned parser_flags = MD_DIALECT_GITHUB | MD_FLAG_NOHTML;
    const unsigned renderer_flags = 0;

    md_html(input,
            static_cast<MD_SIZE>(std::strlen(input)),
            append_output,
            &buffer,
            parser_flags,
            renderer_flags);

    const size_t n = buffer.html.size();
    char* out = static_cast<char*>(std::malloc(n + 1));
    if (out == nullptr) {
        return nullptr;
    }
    std::memcpy(out, buffer.html.data(), n);
    out[n] = '\0';
    return out;
}

EMSCRIPTEN_KEEPALIVE
void md_free(char* ptr) {
    std::free(ptr);
}

}  // extern "C"

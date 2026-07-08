#!/usr/bin/env bash
# Compila o motor C++ para WebAssembly usando Emscripten (emcc).
#
# Pre-requisito: ter o Emscripten instalado e ativado no PATH.
#   https://emscripten.org/docs/getting_started/downloads.html
#
# Uso:  ./build.sh
# Saida: ../frontend/wasm/md.js  +  ../frontend/wasm/md.wasm
set -euo pipefail

cd "$(dirname "$0")"
OUT_DIR="../frontend/wasm"
mkdir -p "$OUT_DIR"

emcc \
  src/md4c.c src/entity.c src/md4c-html.c src/md_engine.cpp \
  -I src \
  -O3 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createMdEngine \
  -s "EXPORTED_FUNCTIONS=['_md_render','_md_free','_malloc','_free']" \
  -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web \
  -s EXPORT_ES6=0 \
  -o "$OUT_DIR/md.js"

echo "OK -> $OUT_DIR/md.js + md.wasm"

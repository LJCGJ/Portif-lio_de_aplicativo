# Compila o motor C++ para WebAssembly usando Emscripten (emcc) no Windows.
#
# Pre-requisito: instalar e ativar o Emscripten (emsdk):
#   https://emscripten.org/docs/getting_started/downloads.html
#   Depois de "emsdk activate latest", rode "emsdk_env.bat" (ou .ps1)
#   para o emcc entrar no PATH desta sessao.
#
# Uso (dentro de backend\):  .\build.ps1
# Saida: ..\frontend\wasm\md.js  +  ..\frontend\wasm\md.wasm

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$out = "..\frontend\wasm"
New-Item -ItemType Directory -Force -Path $out | Out-Null

emcc `
  src/md4c.c src/entity.c src/md4c-html.c src/md_engine.cpp `
  -I src `
  -O3 `
  -s MODULARIZE=1 `
  -s EXPORT_NAME=createMdEngine `
  -s "EXPORTED_FUNCTIONS=['_md_render','_md_free','_malloc','_free']" `
  -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']" `
  -s ALLOW_MEMORY_GROWTH=1 `
  -s ENVIRONMENT=web `
  -s EXPORT_ES6=0 `
  -o "$out\md.js"

Write-Host "OK -> $out\md.js + md.wasm"

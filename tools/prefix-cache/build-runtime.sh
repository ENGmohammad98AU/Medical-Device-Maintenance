#!/usr/bin/env bash
set -euo pipefail
runtime_root="$(pwd)/.cache/prefix-runtime"
mkdir -p "$runtime_root"
git -C "$runtime_root" init
git -C "$runtime_root" remote add origin https://github.com/ngxson/wllama.git
git -C "$runtime_root" fetch --depth=1 origin e3972797f9d508887440e9d3fa87dc296f2dec44
git -C "$runtime_root" checkout --detach FETCH_HEAD
git -C "$runtime_root" submodule update --init --depth=1 llama.cpp
test "$(git -C "$runtime_root/llama.cpp" rev-parse HEAD)" = 83d855c5a6d70487121edbf4020b25c96b7a04e7
node tools/prefix-cache/apply-runtime-patch.mjs "$runtime_root"
docker run --rm -v "$runtime_root:/source" -w /source \
  emscripten/emsdk:4.0.20 bash -euc '
    git config --global --add safe.directory /source/llama.cpp
    mkdir -p build/emdawn src/wasm
    curl --fail --location --retry 3 -o build/emdawn.zip \
      https://github.com/google/dawn/releases/download/v20260317.182325/emdawnwebgpu_pkg-v20260317.182325.zip
    python3 -m zipfile -e build/emdawn.zip build/emdawn
    emcmake cmake -S . -B build -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
      -DEMDAWNWEBGPU_DIR=/source/build/emdawn/emdawnwebgpu_pkg -DWLLAMA_TEST_BACKEND=OFF
    emmake make -C build wllama -j2
    cp build/wllama.js build/wllama.wasm src/wasm/
  '
node tools/prefix-cache/bundle.mjs "$runtime_root"

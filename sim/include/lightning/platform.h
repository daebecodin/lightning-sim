// Memory platform layer. The simulation core never calls libc directly, so the
// same source builds with Emscripten, with a bare wasm32 clang, and natively.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace ls {
namespace platform {

// realloc semantics: p may be null. Returns null on failure (p stays valid).
void* reallocate(void* p, size_t bytes);
void release(void* p);
// Bytes currently handed out. Used by the tests to prove resets do not leak.
size_t liveBytes();

}  // namespace platform
}  // namespace ls

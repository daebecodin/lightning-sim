// Platform layer for hosted builds (Emscripten and native): plain libc.
#include <stdlib.h>
#include <string.h>

#include "lightning/platform.h"

namespace ls {
namespace platform {

namespace {
size_t g_live = 0;
const size_t kHeader = 16;  // keeps 16 byte alignment
}  // namespace

void* reallocate(void* p, size_t bytes) {
  unsigned char* base = p ? static_cast<unsigned char*>(p) - kHeader : nullptr;
  size_t old = 0;
  if (base) memcpy(&old, base, sizeof(size_t));
  unsigned char* q = static_cast<unsigned char*>(realloc(base, bytes + kHeader));
  if (!q) return nullptr;
  memcpy(q, &bytes, sizeof(size_t));
  g_live = g_live - old + bytes;
  return q + kHeader;
}

void release(void* p) {
  if (!p) return;
  unsigned char* base = static_cast<unsigned char*>(p) - kHeader;
  size_t old = 0;
  memcpy(&old, base, sizeof(size_t));
  g_live -= old;
  free(base);
}

size_t liveBytes() { return g_live; }

}  // namespace platform
}  // namespace ls

// Platform layer for a bare wasm32 build with no C library at all
// (clang --target=wasm32 -nostdlib). Provides a small first-fit allocator on
// top of memory.grow plus the mem* functions the compiler may emit calls to.
// Build this file with -fno-builtin.
#include "lightning/platform.h"

extern "C" {
extern unsigned char __heap_base;

void* memset(void* dst, int v, size_t n) {
  unsigned char* d = static_cast<unsigned char*>(dst);
  for (size_t i = 0; i < n; ++i) d[i] = static_cast<unsigned char>(v);
  return dst;
}
void* memcpy(void* dst, const void* src, size_t n) {
  unsigned char* d = static_cast<unsigned char*>(dst);
  const unsigned char* s = static_cast<const unsigned char*>(src);
  for (size_t i = 0; i < n; ++i) d[i] = s[i];
  return dst;
}
void* memmove(void* dst, const void* src, size_t n) {
  unsigned char* d = static_cast<unsigned char*>(dst);
  const unsigned char* s = static_cast<const unsigned char*>(src);
  if (d < s) {
    for (size_t i = 0; i < n; ++i) d[i] = s[i];
  } else {
    for (size_t i = n; i > 0; --i) d[i - 1] = s[i - 1];
  }
  return dst;
}
}

namespace ls {
namespace platform {

namespace {

// Heap layout: [Block header][payload][Block header][payload]...
struct Block {
  uint32_t size;  // payload bytes, multiple of 16
  uint32_t free;
  uint32_t pad[2];
};
const uint32_t kPage = 65536;

uint32_t g_heapStart = 0;
uint32_t g_heapEnd = 0;
size_t g_live = 0;

Block* at(uint32_t addr) { return reinterpret_cast<Block*>(static_cast<uintptr_t>(addr)); }
uint32_t align16(size_t n) { return uint32_t((n + 15u) & ~size_t(15)); }

// Makes sure linear memory covers [0, end).
bool ensure(uint32_t end) {
  const uint32_t have = uint32_t(__builtin_wasm_memory_size(0)) * kPage;
  if (end <= have) return true;
  const uint32_t pages = (end - have + kPage - 1) / kPage;
  return __builtin_wasm_memory_grow(0, pages) != size_t(-1);
}

void initHeap() {
  if (g_heapStart) return;
  g_heapStart = align16(reinterpret_cast<uintptr_t>(&__heap_base));
  g_heapEnd = g_heapStart;
}

// Appends a block at the end of the heap.
Block* extend(uint32_t size) {
  const uint64_t end = uint64_t(g_heapEnd) + sizeof(Block) + size;
  if (end > 0xFFFF0000ull || !ensure(uint32_t(end))) return nullptr;
  Block* b = at(g_heapEnd);
  b->size = size;
  b->free = 0;
  g_heapEnd = uint32_t(end);
  return b;
}

Block* allocate(uint32_t size) {
  initHeap();
  uint32_t a = g_heapStart;
  Block* lastBlock = nullptr;
  while (a < g_heapEnd) {
    Block* b = at(a);
    if (b->free) {
      // merge with following free blocks
      uint32_t next = a + sizeof(Block) + b->size;
      while (next < g_heapEnd && at(next)->free) {
        b->size += sizeof(Block) + at(next)->size;
        next = a + sizeof(Block) + b->size;
      }
      if (b->size >= size) {
        if (b->size - size >= sizeof(Block) + 16) {
          Block* rest = at(a + sizeof(Block) + size);
          rest->size = b->size - size - sizeof(Block);
          rest->free = 1;
          b->size = size;
        }
        b->free = 0;
        return b;
      }
    }
    lastBlock = b;
    a += sizeof(Block) + b->size;
  }
  // A free block at the very end can be grown in place.
  if (lastBlock && lastBlock->free) {
    const uint64_t end = uint64_t(g_heapEnd) + (size - lastBlock->size);
    if (end > 0xFFFF0000ull || !ensure(uint32_t(end))) return nullptr;
    lastBlock->size = size;
    lastBlock->free = 0;
    g_heapEnd = uint32_t(end);
    return lastBlock;
  }
  return extend(size);
}

}  // namespace

void* reallocate(void* p, size_t bytes) {
  if (bytes > 0x7FFFFFF0u) return nullptr;
  const uint32_t size = align16(bytes ? bytes : 1);
  if (!p) {
    Block* b = allocate(size);
    if (!b) return nullptr;
    g_live += b->size;
    return b + 1;
  }
  Block* b = static_cast<Block*>(p) - 1;
  if (b->size >= size) return p;
  const uint32_t addr = uint32_t(reinterpret_cast<uintptr_t>(b));
  const uint32_t next = addr + sizeof(Block) + b->size;
  if (next == g_heapEnd) {  // last block: grow in place
    const uint64_t end = uint64_t(g_heapEnd) + (size - b->size);
    if (end > 0xFFFF0000ull || !ensure(uint32_t(end))) return nullptr;
    g_live += size - b->size;
    b->size = size;
    g_heapEnd = uint32_t(end);
    return p;
  }
  Block* nb = allocate(size);
  if (!nb) return nullptr;
  memcpy(nb + 1, p, b->size);
  g_live += nb->size;
  g_live -= b->size;
  b->free = 1;
  return nb + 1;
}

void release(void* p) {
  if (!p) return;
  Block* b = static_cast<Block*>(p) - 1;
  g_live -= b->size;
  b->free = 1;
}

size_t liveBytes() { return g_live; }

}  // namespace platform
}  // namespace ls

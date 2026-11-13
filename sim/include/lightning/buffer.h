// Growable contiguous buffer for trivially copyable types. No STL so the core
// stays freestanding. Storage is one flat allocation that JavaScript can view
// directly through a typed array.
#pragma once
#include "platform.h"

namespace ls {

template <typename T>
class Buffer {
 public:
  constexpr Buffer() = default;
  Buffer(const Buffer&) = delete;
  Buffer& operator=(const Buffer&) = delete;

  T* data() { return p_; }
  const T* data() const { return p_; }
  uint32_t size() const { return n_; }
  uint32_t capacity() const { return cap_; }
  T& operator[](uint32_t i) { return p_[i]; }
  const T& operator[](uint32_t i) const { return p_[i]; }

  bool reserve(uint32_t want) {
    if (want <= cap_) return true;
    uint32_t next = cap_ ? cap_ * 2u : 256u;
    if (next < want) next = want;
    void* q = platform::reallocate(p_, size_t(next) * sizeof(T));
    if (!q) return false;
    p_ = static_cast<T*>(q);
    cap_ = next;
    return true;
  }
  // Exact-size allocation for grid arrays (no geometric slack).
  bool resizeExact(uint32_t n) {
    if (n > cap_) {
      void* q = platform::reallocate(p_, size_t(n) * sizeof(T));
      if (!q) return false;
      p_ = static_cast<T*>(q);
      cap_ = n;
    }
    n_ = n;
    return true;
  }
  bool push(const T& v) {
    if (n_ == cap_ && !reserve(n_ + 1)) return false;
    p_[n_++] = v;
    return true;
  }
  void pop() { --n_; }
  void clear() { n_ = 0; }
  void fill(const T& v) {
    for (uint32_t i = 0; i < n_; ++i) p_[i] = v;
  }
  void release() {
    if (p_) platform::release(p_);
    p_ = nullptr;
    n_ = cap_ = 0;
  }

 private:
  T* p_ = nullptr;
  uint32_t n_ = 0;
  uint32_t cap_ = 0;
};

}  // namespace ls

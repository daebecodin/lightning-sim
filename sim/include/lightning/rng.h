// PCG32 (O'Neill). Deterministic, tiny, identical on every platform.
#pragma once
#include <stdint.h>

namespace ls {

struct Rng {
  uint64_t state = 0x853c49e6748fea9bULL;
  uint64_t inc = 0xda3e39cb94b95bdbULL;

  void seed(uint64_t s, uint64_t stream) {
    state = 0;
    inc = (stream << 1u) | 1u;
    next();
    state += s;
    next();
  }
  uint32_t next() {
    const uint64_t old = state;
    state = old * 6364136223846793005ULL + inc;
    const uint32_t xorshifted = uint32_t(((old >> 18u) ^ old) >> 27u);
    const uint32_t rot = uint32_t(old >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((32u - rot) & 31u));
  }
  // [0, 1)
  float uniform() { return float(next() >> 8) * (1.0f / 16777216.0f); }
  double uniformD() { return double(next()) * (1.0 / 4294967296.0); }
  float range(float a, float b) { return a + (b - a) * uniform(); }
  // Approximately normal (sum of four uniforms), no libm needed.
  float gaussish() { return (uniform() + uniform() + uniform() + uniform() - 2.0f) * 1.7320508f; }
};

}  // namespace ls

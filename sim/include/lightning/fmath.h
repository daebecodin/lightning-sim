// Small deterministic math kernel. We avoid libm on purpose: pow/exp/log from
// different C libraries differ in the last bits, which would make the same
// seed grow a different bolt natively and in WebAssembly. Everything here is
// plain IEEE arithmetic (build with -ffp-contract=off).
#pragma once
#include <stdint.h>

namespace ls {

inline float fsqrt(float x) { return __builtin_sqrtf(x); }
inline float fabsf_(float x) { return x < 0 ? -x : x; }
inline float fmin_(float a, float b) { return a < b ? a : b; }
inline float fmax_(float a, float b) { return a > b ? a : b; }
inline int imin(int a, int b) { return a < b ? a : b; }
inline int imax(int a, int b) { return a > b ? a : b; }

inline uint32_t floatBits(float f) {
  uint32_t u;
  __builtin_memcpy(&u, &f, 4);
  return u;
}
inline float bitsFloat(uint32_t u) {
  float f;
  __builtin_memcpy(&f, &u, 4);
  return f;
}

// log2(x) for x > 0. Error below 1e-6.
inline float flog2(float x) {
  if (x < 1e-30f) x = 1e-30f;
  uint32_t u = floatBits(x);
  int e = int((u >> 23) & 255u) - 127;
  float m = bitsFloat((u & 0x007FFFFFu) | 0x3F800000u);  // [1, 2)
  if (m > 1.41421356f) {
    m *= 0.5f;
    e += 1;
  }
  const float s = (m - 1.0f) / (m + 1.0f);
  const float s2 = s * s;
  // ln(m) = 2 atanh(s)
  const float ln = 2.0f * s * (1.0f + s2 * (0.33333333f + s2 * (0.2f + s2 * 0.14285714f)));
  return float(e) + ln * 1.44269504f;
}

// 2^x. Error below 1e-6 relative.
inline float fexp2(float x) {
  if (x < -120.0f) return 0.0f;
  if (x > 120.0f) x = 120.0f;
  int e = int(x);
  if (float(e) > x) --e;  // floor
  const float f = (x - float(e)) * 0.69314718f;  // [0, ln2)
  const float p = 1.0f + f * (1.0f + f * (0.5f + f * (0.16666667f + f * (0.041666667f +
                  f * (0.0083333333f + f * (0.0013888889f + f * 0.0001984127f))))));
  return p * bitsFloat(uint32_t(e + 127) << 23);
}

inline float fpow(float x, float y) {
  if (x <= 0.0f) return 0.0f;
  return fexp2(y * flog2(x));
}

inline float fexp(float x) { return fexp2(x * 1.44269504f); }

}  // namespace ls

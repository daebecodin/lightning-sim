#include "lightning/fmath.h"
#include "lightning/sim.h"

namespace ls {

namespace {
const int G = GroundDischarge::kGrid;
const float kEta = 1.35f;       // low exponent: dense, fern-like surface arcs
const uint32_t kMaxNodes = 720;
const float kInv[2] = {1.0f, 0.70710678f};
}  // namespace

void GroundDischarge::destroy() {
  phi_.release();
  soil_.release();
  fixed_.release();
  candIndex_.release();
  candCell_.release();
  candParent_.release();
  candClass_.release();
  xz_.release();
  parent_.release();
  step_.release();
}

float GroundDischarge::sweep(float omega) {
  float maxDelta = 0.0f;
  for (int z = 1; z < G - 1; ++z) {
    int i = z * G + 1;
    for (int x = 1; x < G - 1; ++x, ++i) {
      if (fixed_[uint32_t(i)]) continue;
      const float d = (phi_[uint32_t(i - 1)] + phi_[uint32_t(i + 1)] + phi_[uint32_t(i - G)] +
                       phi_[uint32_t(i + G)]) * 0.25f - phi_[uint32_t(i)];
      phi_[uint32_t(i)] += omega * d;
      const float a = fabsf_(d);
      if (a > maxDelta) maxDelta = a;
    }
  }
  return maxDelta;
}

bool GroundDischarge::run(uint32_t seed, float dirX, float dirZ) {
  const uint32_t n = uint32_t(G * G);
  if (!phi_.resizeExact(n) || !soil_.resizeExact(n) || !fixed_.resizeExact(n) || !candIndex_.resizeExact(n))
    return false;
  Rng rng;
  rng.seed(uint64_t(seed) * 0xD1342543DE82EF95ULL + 77u, 91u);
  candCell_.clear();
  candParent_.clear();
  candClass_.clear();
  xz_.clear();
  parent_.clear();
  step_.clear();

  const int c = G / 2;
  const float ring = float(G / 2 - 2);
  for (int z = 0; z < G; ++z)
    for (int x = 0; x < G; ++x) {
      const uint32_t i = uint32_t(z * G + x);
      const float dx = float(x - c), dz = float(z - c);
      const float r = fsqrt(dx * dx + dz * dz);
      const bool outside = r >= ring || x == 0 || z == 0 || x == G - 1 || z == G - 1;
      fixed_[i] = outside ? 1 : 0;
      // Start from the 2D point-source profile so few sweeps are needed.
      phi_[i] = outside ? 0.0f : 1.0f - flog2(fmax_(r, 0.5f) * 2.0f) / flog2(ring * 2.0f);
      soil_[i] = rng.range(0.45f, 1.55f);  // soil conductivity noise
      candIndex_[i] = -1;
    }

  bool ok = true;
  auto claim = [&](int cell, int32_t parent, uint32_t step) {
    const int z = cell / G, x = cell - z * G;
    const int32_t node = int32_t(parent_.size());
    ok = xz_.push(float(x - c)) && xz_.push(float(z - c)) && parent_.push(parent) && step_.push(step) && ok;
    fixed_[uint32_t(cell)] = 1;
    phi_[uint32_t(cell)] = 1.0f;
    for (int oz = -1; oz <= 1; ++oz)
      for (int ox = -1; ox <= 1; ++ox) {
        if (!ox && !oz) continue;
        const int nb = cell + ox + oz * G;
        if (fixed_[uint32_t(nb)]) continue;
        const int cls = (ox && oz) ? 1 : 0;
        const int32_t ci = candIndex_[uint32_t(nb)];
        if (ci < 0) {
          candIndex_[uint32_t(nb)] = int32_t(candCell_.size());
          ok = candCell_.push(nb) && candParent_.push(node) && candClass_.push(uint8_t(cls)) && ok;
        } else if (cls < int(candClass_[uint32_t(ci)])) {
          candClass_[uint32_t(ci)] = uint8_t(cls);
          candParent_[uint32_t(ci)] = node;
        }
      }
    return node;
  };

  claim(c * G + c, -1, 0);
  for (int s = 0; s < 60; ++s) sweep(1.85f);

  const float invEta[2] = {1.0f, fpow(kInv[1], kEta)};
  float reach = 0.0f;
  for (uint32_t step = 1; ok && parent_.size() < kMaxNodes && reach < 0.93f * ring; ++step) {
    sweep(1.5f);
    sweep(1.5f);
    const uint32_t nc = candCell_.size();
    if (nc == 0) break;
    double sum = 0.0;
    // Weights are cheap in 2D, so recompute them all each step.
    static float w[G * G];
    for (uint32_t i = 0; i < nc; ++i) {
      const int cell = candCell_[i];
      const float drop = 1.0f - phi_[uint32_t(cell)];
      float wi = 0.0f;
      if (drop > 0.0f) {
        const int z = cell / G, x = cell - z * G;
        const float dx = float(x - c), dz = float(z - c);
        const float r = fsqrt(dx * dx + dz * dz);
        // The leader's horizontal momentum sprays charge preferentially
        // along its approach direction.
        const float along = r > 0.0f ? (dx * dirX + dz * dirZ) / r : 0.0f;
        wi = fpow(drop, kEta) * invEta[candClass_[i]] * soil_[uint32_t(cell)] * (1.0f + 0.5f * along);
      }
      w[i] = wi;
      sum += double(wi);
    }
    if (!(sum > 0.0)) break;
    const double r = rng.uniformD() * sum;
    double acc = 0.0;
    uint32_t pick = nc - 1;
    for (uint32_t i = 0; i < nc; ++i) {
      acc += double(w[i]);
      if (acc > r) {
        pick = i;
        break;
      }
    }
    const int cell = candCell_[pick];
    const int32_t parent = candParent_[pick];
    const uint32_t last = nc - 1;
    candIndex_[uint32_t(cell)] = -1;
    if (pick != last) {
      candCell_[pick] = candCell_[last];
      candParent_[pick] = candParent_[last];
      candClass_[pick] = candClass_[last];
      candIndex_[uint32_t(candCell_[pick])] = int32_t(pick);
    }
    candCell_.pop();
    candParent_.pop();
    candClass_.pop();
    const int32_t node = claim(cell, parent, step);
    const float x = xz_[uint32_t(2 * node)], z = xz_[uint32_t(2 * node + 1)];
    const float rr = fsqrt(x * x + z * z);
    if (rr > reach) reach = rr;
  }
  return ok;
}

}  // namespace ls

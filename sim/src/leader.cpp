#include "lightning/fmath.h"
#include "lightning/sim.h"

namespace ls {

namespace {
const float kInvDist[3] = {1.0f, 0.70710678f, 0.57735027f};
const float kSolveTol = 2e-5f;
}  // namespace

// ---------------------------------------------------------------- lifecycle

bool LeaderSim::init(const Config& cfg) {
  cfg_ = cfg;
  cfg_.nx = imax(16, imin(cfg.nx, 192));
  cfg_.ny = imax(32, imin(cfg.ny, 384));
  cfg_.nz = imax(16, imin(cfg.nz, 192));
  cfg_.localRadius = imax(2, imin(cfg.localRadius, 12));
  cfg_.localSweeps = imax(1, imin(cfg.localSweeps, 16));
  cfg_.globalEvery = imax(1, imin(cfg.globalEvery, 64));
  if (!(cfg_.eta >= 1.0f)) cfg_.eta = 1.0f;
  if (cfg_.eta > 8.0f) cfg_.eta = 8.0f;
  sx_ = cfg_.nx + 2;
  sy_ = cfg_.ny + 2;
  sz_ = cfg_.nz + 2;
  const uint32_t n = uint32_t(sx_) * uint32_t(sy_) * uint32_t(sz_);
  ok_ = phi_.resizeExact(n) && rho_.resizeExact(n) && fixed_.resizeExact(n) &&
        candIndex_.resizeExact(n);
  if (!ok_) {
    state_ = kFailed;
    return false;
  }
  return reset(cfg_.seed);
}

void LeaderSim::destroy() {
  phi_.release();
  rho_.release();
  fixed_.release();
  candIndex_.release();
  candCell_.release();
  candParent_.release();
  candClass_.release();
  candY_.release();
  candW_.release();
  pos_.release();
  parent_.release();
  step_.release();
  field_.release();
  subtree_.release();
  gdist_.release();
  flags_.release();
  nodeCell_.release();
  main_.release();
  charges_.release();
  state_ = kIdle;
}

bool LeaderSim::reset(uint32_t seed) {
  if (phi_.size() == 0) return false;
  cfg_.seed = seed;
  rng_.seed(uint64_t(seed) * 0x9E3779B97F4A7C15ULL + 0x5851F42D4C957F2DULL, 54u);
  ok_ = true;

  candCell_.clear();
  candParent_.clear();
  candClass_.clear();
  candY_.clear();
  candW_.clear();
  pos_.clear();
  parent_.clear();
  step_.clear();
  field_.clear();
  subtree_.clear();
  gdist_.clear();
  flags_.clear();
  nodeCell_.clear();
  main_.clear();

  phi_.fill(0.0f);
  rho_.fill(0.0f);
  candIndex_.fill(-1);
  // Ghost shell and the ground layer (padded y = 1) are Dirichlet cells.
  for (int y = 0; y < sy_; ++y)
    for (int z = 0; z < sz_; ++z)
      for (int x = 0; x < sx_; ++x) {
        const bool ghost = x == 0 || y == 0 || z == 0 || x == sx_ - 1 || y == sy_ - 1 || z == sz_ - 1;
        fixed_[idx(x, y, z)] = (ghost || y == 1) ? 1 : 0;
      }

  cloudBase_ = 1 + int(cfg_.cloudBaseFrac * float(cfg_.ny));
  placeCharges();
  initialGuess();

  stepCount_ = 0;
  solveSweeps_ = 0;
  sinceGlobal_ = 0;
  sinceDescent_ = 0;
  stallLevel_ = 0;
  stallEvents_ = 0;
  forcedSteps_ = 0;
  longestStall_ = 0;
  yMin_ = yStart_ = cfg_.ny;
  state_ = kSolving;
  return true;
}

// ------------------------------------------------------------ cloud charge

void LeaderSim::placeCharges() {
  charges_.clear();
  const float nx = float(cfg_.nx), ny = float(cfg_.ny), nz = float(cfg_.nz);
  const float cx = nx * 0.5f + rng_.range(-0.05f, 0.05f) * nx;
  const float cz = nz * 0.5f + rng_.range(-0.05f, 0.05f) * nz;

  // Main negative charge region: a few overlapping lumps.
  for (int i = 0; i < 4; ++i) {
    ChargeBlob b;
    b.x = cx + rng_.gaussish() * 0.09f * nx;
    b.z = cz + rng_.gaussish() * 0.09f * nz;
    b.y = ny * rng_.range(0.83f, 0.89f);
    b.sigmaH = nx * rng_.range(0.12f, 0.17f);
    b.sigmaV = ny * rng_.range(0.035f, 0.050f);
    b.q = rng_.range(0.7f, 1.3f);
    ok_ = charges_.push(b) && ok_;
  }
  // Lower positive charge pocket(s) near the cloud base. They attract the
  // negative leader and give it a sideways start, as in real storms.
  const int nLow = 1 + int(rng_.next() & 1u);
  for (int i = 0; i < nLow; ++i) {
    float u, v, r2;
    do {
      u = rng_.range(-1.0f, 1.0f);
      v = rng_.range(-1.0f, 1.0f);
      r2 = u * u + v * v;
    } while (r2 > 1.0f || r2 < 0.05f);
    const float inv = 1.0f / fsqrt(r2);
    const float r = nx * rng_.range(0.08f, 0.16f);
    ChargeBlob b;
    b.x = cx + u * inv * r;
    b.z = cz + v * inv * r;
    b.y = ny * rng_.range(0.715f, 0.745f);
    b.sigmaH = nx * rng_.range(0.05f, 0.08f);
    b.sigmaV = ny * rng_.range(0.020f, 0.030f);
    b.q = -rng_.range(0.9f, 1.5f);
    ok_ = charges_.push(b) && ok_;
  }

  for (uint32_t c = 0; c < charges_.size(); ++c) {
    const ChargeBlob& b = charges_[c];
    const int x0 = imax(1, int(b.x - 3.0f * b.sigmaH) + 1), x1 = imin(cfg_.nx, int(b.x + 3.0f * b.sigmaH) + 2);
    const int z0 = imax(1, int(b.z - 3.0f * b.sigmaH) + 1), z1 = imin(cfg_.nz, int(b.z + 3.0f * b.sigmaH) + 2);
    const int y0 = imax(2, int(b.y - 3.0f * b.sigmaV) + 1), y1 = imin(cfg_.ny, int(b.y + 3.0f * b.sigmaV) + 2);
    const float ih = 0.5f / (b.sigmaH * b.sigmaH), iv = 0.5f / (b.sigmaV * b.sigmaV);
    for (int y = y0; y <= y1; ++y)
      for (int z = z0; z <= z1; ++z)
        for (int x = x0; x <= x1; ++x) {
          const float dx = float(x - 1) - b.x, dy = float(y - 1) - b.y, dz = float(z - 1) - b.z;
          rho_[idx(x, y, z)] += b.q * fexp(-((dx * dx + dz * dz) * ih + dy * dy * iv));
        }
  }
}

// Exact solution of the horizontally averaged problem: a 1D Poisson equation
// with phi = 0 at the ground and zero gradient at the top. It removes the
// slowest converging mode before the 3D relaxation starts.
void LeaderSim::initialGuess() {
  const int nx = cfg_.nx, ny = cfg_.ny, nz = cfg_.nz;
  // gradient(y) = sum of mean rho at and above y; walk down, then integrate up.
  // Reuse candW_ as scratch.
  if (!candW_.resizeExact(uint32_t(sy_))) {
    ok_ = false;
    return;
  }
  const double inv = 1.0 / double(nx * nz);
  double above = 0.0;
  for (int y = ny; y >= 1; --y) {
    double s = 0.0;
    for (int z = 1; z <= nz; ++z)
      for (int x = 1; x <= nx; ++x) s += double(rho_[idx(x, y, z)]);
    above += s * inv;
    candW_[uint32_t(y)] = float(above);
  }
  float v = 0.0f, peak = 0.0f;
  for (int y = 2; y <= ny; ++y) {
    v += candW_[uint32_t(y)];
    if (fabsf_(v) > peak) peak = fabsf_(v);
    for (int z = 1; z <= nz; ++z)
      for (int x = 1; x <= nx; ++x) phi_[idx(x, y, z)] = v;
  }
  candW_.clear();
  solveScale_ = peak > 0.0f ? peak : 1.0f;
  expectedSweeps_ = uint32_t(imax(nx, nz));
}

// ------------------------------------------------------------------ solver

void LeaderSim::refreshGhosts() {
  const int nx = cfg_.nx, ny = cfg_.ny, nz = cfg_.nz;
  for (int y = 1; y <= ny; ++y) {
    for (int z = 1; z <= nz; ++z) {
      phi_[idx(0, y, z)] = phi_[idx(1, y, z)];
      phi_[idx(nx + 1, y, z)] = phi_[idx(nx, y, z)];
    }
    for (int x = 0; x <= nx + 1; ++x) {
      phi_[idx(x, y, 0)] = phi_[idx(x, y, 1)];
      phi_[idx(x, y, nz + 1)] = phi_[idx(x, y, nz)];
    }
  }
  for (int z = 0; z <= nz + 1; ++z)
    for (int x = 0; x <= nx + 1; ++x) phi_[idx(x, ny + 1, z)] = phi_[idx(x, ny, z)];
}

// Red-black successive over-relaxation on an inclusive box of interior cells.
// Cells of one colour only depend on cells of the other colour, so each half
// sweep has no loop-carried dependency (about 5x faster than lexicographic
// Gauss-Seidel here) while converging at the same rate.
// Returns the largest update, used as the convergence measure.
float LeaderSim::sweepBox(int x0, int x1, int y0, int y1, int z0, int z1, float omega) {
  const int dz = sx_, dy = sx_ * sz_;
  float* phi = phi_.data();
  const float* rho = rho_.data();
  const uint8_t* fixed = fixed_.data();
  float maxDelta = 0.0f;
  for (int colour = 0; colour < 2; ++colour) {
    for (int y = y0; y <= y1; ++y) {
      for (int z = z0; z <= z1; ++z) {
        const int xs = x0 + ((x0 + y + z + colour) & 1);
        int i = idx(xs, y, z);
        for (int x = xs; x <= x1; x += 2, i += 2) {
          if (fixed[i]) continue;
          const float nb = phi[i - 1] + phi[i + 1] + phi[i - dz] + phi[i + dz] + phi[i - dy] + phi[i + dy];
          const float d = (nb + rho[i]) * (1.0f / 6.0f) - phi[i];
          phi[i] += omega * d;
          const float a = fabsf_(d);
          if (a > maxDelta) maxDelta = a;
        }
      }
    }
  }
  return maxDelta;
}

// -------------------------------------------------------------- stepping

State LeaderSim::advance(int budget) {
  if (budget < 1) budget = 1;
  if (state_ == kSolving) {
    const int nx = cfg_.nx, ny = cfg_.ny, nz = cfg_.nz;
    // Near-optimal SOR factor for the slowest remaining (lateral) mode.
    const float t = 3.14159265f / float(imax(nx, nz));
    const float omega = 2.0f / (1.0f + (t - t * t * t * (1.0f / 6.0f)));
    const int sweeps = imax(1, budget / 16);
    const uint32_t maxSweeps = uint32_t(6 * ny);
    for (int s = 0; s < sweeps; ++s) {
      refreshGhosts();
      const float d = sweepBox(1, nx, 2, ny, 1, nz, omega);
      ++solveSweeps_;
      if ((d < kSolveTol * solveScale_ && solveSweeps_ >= 20) || solveSweeps_ >= maxSweeps) {
        if (!beginGrowth()) state_ = kFailed;
        break;
      }
    }
  } else if (state_ == kGrowing) {
    for (int i = 0; i < budget && state_ == kGrowing; ++i) growStep();
  }
  if (!ok_) state_ = kFailed;
  return state_;
}

float LeaderSim::progress() const {
  switch (state_) {
    case kSolving: {
      const float f = float(solveSweeps_) / float(expectedSweeps_ ? expectedSweeps_ : 1);
      return 0.3f * (f > 1.0f ? 1.0f : f);
    }
    case kGrowing: {
      const float span = float(imax(1, yStart_ - 1));
      const float f = float(yStart_ - yMin_) / span;
      return 0.3f + 0.7f * (f > 1.0f ? 1.0f : f);
    }
    case kAttached:
      return 1.0f;
    default:
      return 0.0f;
  }
}

bool LeaderSim::pushNode(int x, int y, int z, int32_t parent, float field, uint8_t flags) {
  bool ok = pos_.push(float(x - 1)) && pos_.push(float(y - 1)) && pos_.push(float(z - 1));
  ok = ok && parent_.push(parent) && step_.push(stepCount_) && field_.push(field) &&
       flags_.push(flags) && nodeCell_.push(idx(x, y, z));
  if (!ok) ok_ = false;
  return ok;
}

bool LeaderSim::beginGrowth() {
  const int nx = cfg_.nx, ny = cfg_.ny, nz = cfg_.nz;
  const int dz = sx_, dy = sx_ * sz_;
  refreshGhosts();

  // Initiation: the cell with the strongest field in the lower cloud.
  int best = -1, bx = 0, by = 0, bz = 0;
  float bestE = -1.0f;
  const int y0 = cloudBase_ + 2, y1 = imax(y0, 1 + int(0.82f * float(ny)));
  for (int y = y0; y <= y1; ++y)
    for (int z = 1 + nz / 4; z <= nz - nz / 4; ++z)
      for (int x = 1 + nx / 4; x <= nx - nx / 4; ++x) {
        const int i = idx(x, y, z);
        if (phi_[i] <= 0.0f) continue;
        const float gx = phi_[i + 1] - phi_[i - 1], gy = phi_[i + dy] - phi_[i - dy], gz = phi_[i + dz] - phi_[i - dz];
        const float e2 = gx * gx + gy * gy + gz * gz;
        if (e2 > bestE) {
          bestE = e2;
          best = i;
          bx = x;
          by = y;
          bz = z;
        }
      }
  if (best < 0) {
    bx = 1 + nx / 2;
    bz = 1 + nz / 2;
    by = 1 + int(0.78f * float(ny));
    best = idx(bx, by, bz);
  }
  float phiL = phi_[best];
  if (!(phiL > 1e-20f)) phiL = solveScale_;

  // Normalise so the channel potential is exactly 1.
  const float scale = 1.0f / phiL;
  const uint32_t n = phi_.size();
  for (uint32_t i = 0; i < n; ++i) {
    phi_[i] *= scale;
    rho_[i] *= scale;
  }
  for (int c = 0; c < 3; ++c) invDistEta_[c] = fpow(kInvDist[c], cfg_.eta);

  yMin_ = yStart_ = by;
  if (!pushNode(bx, by, bz, -1, 0.0f, kNodeRoot)) return false;

  // Claim the root cell and seed the candidate list.
  fixed_[best] = 1;
  phi_[best] = 1.0f;
  for (int oy = -1; oy <= 1; ++oy)
    for (int oz = -1; oz <= 1; ++oz)
      for (int ox = -1; ox <= 1; ++ox) {
        if (!ox && !oy && !oz) continue;
        const int nb = best + ox + oz * dz + oy * dy;
        if (fixed_[nb]) continue;
        const int cls = (ox ? 1 : 0) + (oy ? 1 : 0) + (oz ? 1 : 0) - 1;
        candIndex_[nb] = int32_t(candCell_.size());
        ok_ = candCell_.push(nb) && candParent_.push(0) && candClass_.push(uint8_t(cls)) &&
              candY_.push(int16_t(by + oy)) && candW_.push(0.0f) && ok_;
      }
  const int r = cfg_.localRadius;
  for (int s = 0; s < cfg_.localSweeps; ++s)
    sweepBox(imax(1, bx - r), imin(nx, bx + r), imax(2, by - r), imin(ny, by + r), imax(1, bz - r),
             imin(nz, bz + r), cfg_.omegaLocal);
  recomputeAllWeights();
  state_ = kGrowing;
  return ok_;
}

// Growth probability weight: (potential drop across the gap / gap length)^eta.
float LeaderSim::weightOf(uint32_t c) const {
  const float d = 1.0f - phi_[uint32_t(candCell_[c])];
  if (!(d > 0.0f)) return 0.0f;
  return fpow(d, cfg_.eta) * invDistEta_[candClass_[c]];
}

void LeaderSim::recomputeAllWeights() {
  const uint32_t n = candCell_.size();
  for (uint32_t i = 0; i < n; ++i) candW_[i] = weightOf(i);
}

void LeaderSim::recomputeWeightsInBox(int x0, int x1, int y0, int y1, int z0, int z1) {
  for (int y = y0; y <= y1; ++y)
    for (int z = z0; z <= z1; ++z) {
      int i = idx(x0, y, z);
      for (int x = x0; x <= x1; ++x, ++i) {
        const int32_t c = candIndex_[i];
        if (c >= 0) candW_[uint32_t(c)] = weightOf(uint32_t(c));
      }
    }
}

// Stall recovery, last resort: take the strongest candidate strictly below
// the lowest channel cell. One always exists until the ground is reached, so
// forced descent terminates.
int LeaderSim::pickForced() const {
  const uint32_t n = candCell_.size();
  int best = -1;
  float bestW = -1.0f;
  for (uint32_t i = 0; i < n; ++i) {
    if (int(candY_[i]) >= yMin_) continue;
    // Prefer field strength, break ties toward straight-down neighbours.
    const float w = candW_[i] + 1e-30f * float(3 - candClass_[i]);
    if (w > bestW) {
      bestW = w;
      best = int(i);
    }
  }
  if (best < 0) {
    // Defensive: lowest candidate of all.
    int lowY = 1 << 30;
    for (uint32_t i = 0; i < n; ++i)
      if (int(candY_[i]) < lowY) {
        lowY = int(candY_[i]);
        best = int(i);
      }
  }
  return best;
}

bool LeaderSim::addNode(uint32_t c, bool forced) {
  const int nx = cfg_.nx, ny = cfg_.ny, nz = cfg_.nz;
  const int dz = sx_, dy = sx_ * sz_;
  const int cell = candCell_[c];
  const int32_t parent = candParent_[c];
  const int cls = candClass_[c];
  const int y = cell / dy;
  const int rem = cell - y * dy;
  const int z = rem / dz;
  const int x = rem - z * dz;

  float drop = 1.0f - phi_[uint32_t(cell)];
  if (drop < 0.0f) drop = 0.0f;
  const float field = drop * kInvDist[cls];

  // swap-remove the candidate
  const uint32_t last = candCell_.size() - 1;
  candIndex_[uint32_t(cell)] = -1;
  if (c != last) {
    candCell_[c] = candCell_[last];
    candParent_[c] = candParent_[last];
    candClass_[c] = candClass_[last];
    candY_[c] = candY_[last];
    candW_[c] = candW_[last];
    candIndex_[uint32_t(candCell_[c])] = int32_t(c);
  }
  candCell_.pop();
  candParent_.pop();
  candClass_.pop();
  candY_.pop();
  candW_.pop();

  const int32_t node = int32_t(nodeCount());
  if (!pushNode(x, y, z, parent, field, forced ? kNodeForced : 0)) return false;
  fixed_[uint32_t(cell)] = 1;
  phi_[uint32_t(cell)] = 1.0f;

  for (int oy = -1; oy <= 1; ++oy)
    for (int oz = -1; oz <= 1; ++oz)
      for (int ox = -1; ox <= 1; ++ox) {
        if (!ox && !oy && !oz) continue;
        const int nb = cell + ox + oz * dz + oy * dy;
        if (fixed_[uint32_t(nb)]) continue;
        const int ncls = (ox ? 1 : 0) + (oy ? 1 : 0) + (oz ? 1 : 0) - 1;
        const int32_t ci = candIndex_[uint32_t(nb)];
        if (ci < 0) {
          candIndex_[uint32_t(nb)] = int32_t(candCell_.size());
          ok_ = candCell_.push(nb) && candParent_.push(node) && candClass_.push(uint8_t(ncls)) &&
                candY_.push(int16_t(y + oy)) && candW_.push(0.0f) && ok_;
        } else if (ncls < int(candClass_[uint32_t(ci)])) {
          candClass_[uint32_t(ci)] = uint8_t(ncls);
          candParent_[uint32_t(ci)] = node;
        }
      }

  // Lagged potential update: relax the neighbourhood now, the whole grid
  // every few steps.
  const int r = cfg_.localRadius;
  const int x0 = imax(1, x - r), x1 = imin(nx, x + r);
  const int y0 = imax(2, y - r), y1 = imin(ny, y + r);
  const int z0 = imax(1, z - r), z1 = imin(nz, z + r);
  for (int s = 0; s < cfg_.localSweeps; ++s) sweepBox(x0, x1, y0, y1, z0, z1, cfg_.omegaLocal);
  if (++sinceGlobal_ >= cfg_.globalEvery) {
    sinceGlobal_ = 0;
    refreshGhosts();
    sweepBox(1, nx, 2, ny, 1, nz, cfg_.omegaGlobal);
    recomputeAllWeights();
  } else {
    recomputeWeightsInBox(x0, x1, y0, y1, z0, z1);
  }

  ++stepCount_;
  if (y < yMin_) {
    yMin_ = y;
    if (sinceDescent_ > longestStall_) longestStall_ = sinceDescent_;
    sinceDescent_ = 0;
  } else {
    ++sinceDescent_;
  }

  // Ground attachment: the cell directly above the grounded layer.
  if (y == 2) {
    pushNode(x, 1, z, node, field, kNodeGround);
    finalize();
    state_ = kAttached;
  }
  return ok_;
}

void LeaderSim::growStep() {
  const uint32_t n = candCell_.size();
  if (n == 0) {
    ok_ = false;
    return;
  }

  // ---- stall detection. Progress is measured by the lowest altitude the
  // channel has reached. If it does not descend for a while we escalate:
  //   level 1: mild preference for low candidates
  //   level 2: strong preference
  //   level 3: forced descent (deterministic)
  // Runaway trees are caught by node-count caps.
  const uint32_t window = uint32_t(imax(64, cfg_.ny * 3 / 4));
  const uint32_t nodes = nodeCount();
  const uint32_t softCap = uint32_t(40 * cfg_.ny), hardCap = uint32_t(60 * cfg_.ny);
  int level = 0;
  if (sinceDescent_ >= window) level = 1;
  if (sinceDescent_ >= 2 * window || nodes > softCap) level = 2;
  if (sinceDescent_ >= 3 * window || nodes > hardCap) level = 3;
  if (level > 0 && stallLevel_ == 0) ++stallEvents_;
  stallLevel_ = level;

  int pick = -1;
  if (level < 3) {
    const float k = level == 1 ? 0.32f : 1.0f;
    double sum = 0.0;
    if (level == 0) {
      for (uint32_t i = 0; i < n; ++i) sum += double(candW_[i]);
    } else {
      for (uint32_t i = 0; i < n; ++i)
        sum += double(candW_[i] * fexp2(-k * float(imax(0, int(candY_[i]) - yMin_ + 1))));
    }
    if (sum > 0.0) {  // false for zero and for NaN
      const double r = rng_.uniformD() * sum;
      double acc = 0.0;
      int lastPositive = -1;
      for (uint32_t i = 0; i < n; ++i) {
        const float w = level == 0 ? candW_[i]
                                   : candW_[i] * fexp2(-k * float(imax(0, int(candY_[i]) - yMin_ + 1)));
        if (!(w > 0.0f)) continue;
        lastPositive = int(i);
        acc += double(w);
        if (acc > r) {
          pick = int(i);
          break;
        }
      }
      if (pick < 0) pick = lastPositive;
    }
  }
  const bool forced = level > 0 || pick < 0;
  if (pick < 0) pick = pickForced();
  if (pick < 0) {
    ok_ = false;
    return;
  }
  if (forced) ++forcedSteps_;
  addNode(uint32_t(pick), forced);
}

// ------------------------------------------------------------ post-process

void LeaderSim::finalize() {
  const uint32_t n = nodeCount();
  if (!subtree_.resizeExact(n) || !gdist_.resizeExact(n)) {
    ok_ = false;
    return;
  }
  // Children are always created after their parent, so one reverse pass
  // accumulates subtree sizes.
  subtree_.fill(1u);
  for (uint32_t i = n - 1; i > 0; --i) subtree_[uint32_t(parent_[i])] += subtree_[i];

  // Main channel: ground node back to the root.
  main_.clear();
  for (int32_t i = int32_t(n - 1); i >= 0; i = parent_[uint32_t(i)]) {
    flags_[uint32_t(i)] |= kNodeMain;
    ok_ = main_.push(uint32_t(i)) && ok_;
  }
  for (uint32_t a = 0, b = main_.size() - 1; a < b; ++a, --b) {
    const uint32_t t = main_[a];
    main_[a] = main_[b];
    main_[b] = t;
  }

  // Channel length from every node to the strike point. The return stroke
  // travels up the main channel and out along each branch from its junction.
  auto segLen = [this](uint32_t a, uint32_t b) {
    const float dx = pos_[3 * a] - pos_[3 * b], dy = pos_[3 * a + 1] - pos_[3 * b + 1],
                dz = pos_[3 * a + 2] - pos_[3 * b + 2];
    return fsqrt(dx * dx + dy * dy + dz * dz);
  };
  gdist_.fill(-1.0f);
  gdist_[n - 1] = 0.0f;
  for (uint32_t k = main_.size() - 1; k > 0; --k)
    gdist_[main_[k - 1]] = gdist_[main_[k]] + segLen(main_[k - 1], main_[k]);
  for (uint32_t i = 1; i < n; ++i)
    if (gdist_[i] < 0.0f) gdist_[i] = gdist_[uint32_t(parent_[i])] + segLen(i, uint32_t(parent_[i]));
}

void LeaderSim::approachDirection(float* dx, float* dz) const {
  *dx = 0.0f;
  *dz = 0.0f;
  const uint32_t m = main_.size();
  if (m < 2) return;
  const uint32_t a = main_[m - 1], b = main_[m > 12 ? m - 12 : 0];
  const float x = pos_[3 * a] - pos_[3 * b], z = pos_[3 * a + 2] - pos_[3 * b + 2];
  const float len = fsqrt(x * x + z * z);
  if (len > 1e-3f) {
    *dx = x / len;
    *dz = z / len;
  }
}

}  // namespace ls

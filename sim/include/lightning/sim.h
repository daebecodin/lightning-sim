// Stepped-leader simulation: a dielectric breakdown model (DBM, after Niemeyer,
// Pietronero and Wiesmann 1984) driven by an electric potential field.
//
// WHAT IS SIMULATED HERE
//   * A scalar potential on a regular 3D grid obeying Poisson's equation
//       laplacian(phi) = -rho
//     with cloud charge as the source term rho, a grounded lower boundary
//     (phi = 0 on the bottom cell layer) and zero-gradient side and top walls.
//   * The leader channel as a conductor held at the potential of its
//     initiation point (phi = 1 after normalisation).
//   * Stochastic growth: each step one cell adjacent to the channel joins it,
//     chosen with probability proportional to (local field)^eta.
//
// SIGN CONVENTION: we work with psi = -phi so that the main negative cloud
// charge is a positive source. The model is sign symmetric.
//
// DOCUMENTED APPROXIMATIONS
//   * The potential is not re-solved to convergence after every growth step.
//     We relax a box around the new cell and run a full sweep every few
//     steps (a lagged solve). Far-field corrections arrive a few steps late.
//   * No charge transport, channel resistance, or time-dependent chemistry.
//     The leader is a perfect conductor and "time" is the growth step index.
//   * Only the lower part of the cloud is inside the domain. The upper
//     positive charge region of a real thundercloud is ignored.
//   * Stall recovery (see below) nudges a stuck leader downward. Nodes added
//     that way are flagged so they can be told apart from pure DBM growth.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "buffer.h"
#include "rng.h"

namespace ls {

struct Config {
  int nx = 64;
  int ny = 128;  // vertical
  int nz = 64;
  uint32_t seed = 1;
  float eta = 4.2f;            // DBM exponent: higher = fewer branches
  float cloudBaseFrac = 0.70f; // cloud base height as a fraction of ny
  int localRadius = 6;         // half size of the box relaxed after each step
  int localSweeps = 4;
  int globalEvery = 8;         // one full-grid sweep every N growth steps
  float omegaLocal = 1.3f;
  float omegaGlobal = 1.7f;
};

enum State : int32_t {
  kIdle = 0,
  kSolving = 1,   // initial Poisson solve
  kGrowing = 2,   // leader descending
  kAttached = 3,  // reached the ground, outputs are final
  kFailed = -1,   // out of memory
};

enum NodeFlag : uint8_t {
  kNodeMain = 1,    // on the path from the initiation point to the ground
  kNodeForced = 2,  // added by stall recovery, not by pure DBM sampling
  kNodeGround = 4,  // the ground attachment node
  kNodeRoot = 8,    // initiation point
};

struct ChargeBlob {
  float x, y, z;      // centre, cell units
  float sigmaH;       // horizontal standard deviation, cells
  float sigmaV;       // vertical standard deviation, cells
  float q;            // signed strength (psi convention)
};

class LeaderSim {
 public:
  constexpr LeaderSim() = default;

  // Allocates or reuses grid storage and restarts from the given config.
  bool init(const Config& cfg);
  // Same grid, new seed. Never allocates grid storage.
  bool reset(uint32_t seed);
  void destroy();

  // Performs a bounded amount of work and returns the state.
  //   kSolving: budget / 16 (at least one) full SOR sweeps
  //   kGrowing: up to `budget` growth steps
  State advance(int budget);

  State state() const { return state_; }
  float progress() const;
  const Config& config() const { return cfg_; }

  // ---- geometry outputs (structure of arrays, node index = creation order)
  uint32_t nodeCount() const { return parent_.size(); }
  const float* positions() const { return pos_.data(); }      // xyz, cell units, y = 0 ground
  const int32_t* parents() const { return parent_.data(); }   // -1 for the root
  const uint32_t* steps() const { return step_.data(); }      // growth step when added
  const float* fields() const { return field_.data(); }       // normalised field when added
  const uint32_t* subtrees() const { return subtree_.data(); }// nodes downstream, incl. self
  const float* groundDist() const { return gdist_.data(); }   // channel length to the strike
  const uint8_t* flags() const { return flags_.data(); }
  uint32_t mainCount() const { return main_.size(); }
  const uint32_t* mainPath() const { return main_.data(); }   // root -> ground
  uint32_t chargeCount() const { return charges_.size(); }
  const ChargeBlob* charges() const { return charges_.data(); }

  // ---- diagnostics
  uint32_t totalSteps() const { return stepCount_; }
  uint32_t stallEvents() const { return stallEvents_; }
  uint32_t forcedSteps() const { return forcedSteps_; }
  uint32_t solveSweeps() const { return solveSweeps_; }
  uint32_t longestStall() const { return longestStall_; }
  float cloudBaseY() const { return float(cloudBase_ - 1); }
  // Horizontal approach direction of the last few main-channel cells.
  void approachDirection(float* dx, float* dz) const;

 private:
  int idx(int x, int y, int z) const { return x + sx_ * (z + sz_ * y); }
  void placeCharges();
  void initialGuess();
  void refreshGhosts();
  float sweepBox(int x0, int x1, int y0, int y1, int z0, int z1, float omega);
  bool beginGrowth();
  void growStep();
  int pickForced() const;
  bool addNode(uint32_t cand, bool forced);
  bool pushNode(int x, int y, int z, int32_t parent, float field, uint8_t flags);
  float weightOf(uint32_t cand) const;
  void recomputeAllWeights();
  void recomputeWeightsInBox(int x0, int x1, int y0, int y1, int z0, int z1);
  void finalize();

  Config cfg_{};
  State state_ = kIdle;
  Rng rng_{};

  // padded grid: interior cells are 1..n on each axis
  int sx_ = 0, sy_ = 0, sz_ = 0;
  int cloudBase_ = 0;  // padded y of the cloud base
  Buffer<float> phi_;
  Buffer<float> rho_;
  Buffer<uint8_t> fixed_;      // 1 = Dirichlet (ground or channel)
  Buffer<int32_t> candIndex_;  // cell -> candidate slot or -1

  // candidates (cells adjacent to the channel)
  Buffer<int32_t> candCell_;
  Buffer<int32_t> candParent_;
  Buffer<uint8_t> candClass_;  // 0 face, 1 edge, 2 corner neighbour
  Buffer<int16_t> candY_;
  Buffer<float> candW_;
  float invDistEta_[3] = {1, 1, 1};

  // nodes
  Buffer<float> pos_;
  Buffer<int32_t> parent_;
  Buffer<uint32_t> step_;
  Buffer<float> field_;
  Buffer<uint32_t> subtree_;
  Buffer<float> gdist_;
  Buffer<uint8_t> flags_;
  Buffer<int32_t> nodeCell_;
  Buffer<uint32_t> main_;
  Buffer<ChargeBlob> charges_;

  // bookkeeping
  uint32_t stepCount_ = 0;
  uint32_t solveSweeps_ = 0;
  uint32_t expectedSweeps_ = 1;
  float solveScale_ = 1.0f;
  int sinceGlobal_ = 0;
  int yMin_ = 0;        // lowest padded y reached
  int yStart_ = 0;
  // stall detection
  uint32_t sinceDescent_ = 0;
  int stallLevel_ = 0;
  uint32_t stallEvents_ = 0;
  uint32_t forcedSteps_ = 0;
  uint32_t longestStall_ = 0;
  bool ok_ = true;
};

// Surface discharge on the ground around the strike point: a 2D DBM that
// spreads from the attachment cell toward a grounded ring. It produces the
// branching scorch (Lichtenberg) figure. The leader's horizontal approach
// direction biases the spread, and per-cell soil conductivity noise makes
// the arms irregular.
class GroundDischarge {
 public:
  enum { kGrid = 96 };
  constexpr GroundDischarge() = default;

  bool run(uint32_t seed, float dirX, float dirZ);
  void destroy();

  uint32_t nodeCount() const { return parent_.size(); }
  const float* positions() const { return xz_.data(); }     // x,z in cells from the centre
  const int32_t* parents() const { return parent_.data(); }
  const uint32_t* steps() const { return step_.data(); }

 private:
  float sweep(float omega);

  Buffer<float> phi_;
  Buffer<float> soil_;
  Buffer<uint8_t> fixed_;
  Buffer<int32_t> candIndex_;
  Buffer<int32_t> candCell_;
  Buffer<int32_t> candParent_;
  Buffer<uint8_t> candClass_;
  Buffer<float> xz_;
  Buffer<int32_t> parent_;
  Buffer<uint32_t> step_;
};

}  // namespace ls

#include "wasm_api.h"

#include "lightning/fmath.h"
#include "lightning/platform.h"
#include "lightning/sim.h"

namespace {

ls::LeaderSim g_sim;
ls::GroundDischarge g_ground;
uint32_t g_header[LS_H_COUNT];
bool g_groundDone = false;

uint32_t ptr(const void* p) { return uint32_t(reinterpret_cast<uintptr_t>(p)); }

void publish() {
  uint32_t* h = g_header;
  const ls::Config& c = g_sim.config();
  h[LS_H_VERSION] = LS_API_VERSION;
  h[LS_H_STATE] = uint32_t(int32_t(g_sim.state()));
  h[LS_H_PROGRESS] = ls::floatBits(g_sim.progress());
  h[LS_H_NX] = uint32_t(c.nx);
  h[LS_H_NY] = uint32_t(c.ny);
  h[LS_H_NZ] = uint32_t(c.nz);
  h[LS_H_SEED] = c.seed;
  h[LS_H_NODE_COUNT] = g_sim.nodeCount();
  h[LS_H_POS_PTR] = ptr(g_sim.positions());
  h[LS_H_PARENT_PTR] = ptr(g_sim.parents());
  h[LS_H_STEP_PTR] = ptr(g_sim.steps());
  h[LS_H_FIELD_PTR] = ptr(g_sim.fields());
  h[LS_H_SUBTREE_PTR] = ptr(g_sim.subtrees());
  h[LS_H_GDIST_PTR] = ptr(g_sim.groundDist());
  h[LS_H_FLAGS_PTR] = ptr(g_sim.flags());
  h[LS_H_MAIN_COUNT] = g_sim.mainCount();
  h[LS_H_MAIN_PTR] = ptr(g_sim.mainPath());
  h[LS_H_TOTAL_STEPS] = g_sim.totalSteps();
  h[LS_H_STALL_EVENTS] = g_sim.stallEvents();
  h[LS_H_FORCED_STEPS] = g_sim.forcedSteps();
  h[LS_H_LONGEST_STALL] = g_sim.longestStall();
  h[LS_H_SOLVE_SWEEPS] = g_sim.solveSweeps();
  h[LS_H_CHARGE_COUNT] = g_sim.chargeCount();
  h[LS_H_CHARGE_PTR] = ptr(g_sim.charges());
  h[LS_H_CLOUD_BASE] = ls::floatBits(g_sim.cloudBaseY());
  h[LS_H_GROUND_COUNT] = g_groundDone ? g_ground.nodeCount() : 0u;
  h[LS_H_GROUND_POS_PTR] = ptr(g_ground.positions());
  h[LS_H_GROUND_PARENT_PTR] = ptr(g_ground.parents());
  h[LS_H_GROUND_STEP_PTR] = ptr(g_ground.steps());
  h[LS_H_GROUND_GRID] = uint32_t(ls::GroundDischarge::kGrid);
  h[LS_H_LIVE_BYTES] = uint32_t(ls::platform::liveBytes());
}

}  // namespace

extern "C" {

uint32_t* ls_header() {
  publish();
  return g_header;
}

int32_t ls_init(int32_t nx, int32_t ny, int32_t nz, uint32_t seed, float eta) {
  ls::Config cfg;
  cfg.nx = nx;
  cfg.ny = ny;
  cfg.nz = nz;
  cfg.seed = seed;
  if (eta > 0.0f) cfg.eta = eta;
  g_groundDone = false;
  g_sim.init(cfg);
  publish();
  return int32_t(g_sim.state());
}

int32_t ls_reset(uint32_t seed) {
  g_groundDone = false;
  if (!g_sim.reset(seed)) {
    publish();
    return int32_t(ls::kFailed);
  }
  publish();
  return int32_t(g_sim.state());
}

int32_t ls_step(int32_t budget) {
  ls::State s = g_sim.advance(budget);
  if (s == ls::kAttached && !g_groundDone) {
    // The leader geometry drives the ground discharge: it starts at the
    // attachment point and is biased along the leader's approach direction.
    float dx = 0.0f, dz = 0.0f;
    g_sim.approachDirection(&dx, &dz);
    g_groundDone = g_ground.run(g_sim.config().seed, dx, dz);
  }
  publish();
  return int32_t(s);
}

void ls_destroy() {
  g_sim.destroy();
  g_ground.destroy();
  g_groundDone = false;
  publish();
}

}  // extern "C"

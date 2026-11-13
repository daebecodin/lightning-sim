// The complete WebAssembly surface of the simulation: four functions and one
// header block. JavaScript calls ls_step() in a loop, then reads every buffer
// through typed-array views located via the header. There are no per-point
// calls across the boundary.
#pragma once
#include <stdint.h>

// Header slots (uint32 each). Pointers are byte offsets into linear memory
// and may change after any call, so re-read them after every ls_* call.
enum LsHeaderSlot {
  LS_H_VERSION = 0,
  LS_H_STATE,          // int32: 1 solving, 2 growing, 3 attached, -1 failed
  LS_H_PROGRESS,       // float bits, 0..1
  LS_H_NX,
  LS_H_NY,
  LS_H_NZ,
  LS_H_SEED,
  LS_H_NODE_COUNT,
  LS_H_POS_PTR,        // float32[3n] cell units, y = 0 is the ground layer
  LS_H_PARENT_PTR,     // int32[n]
  LS_H_STEP_PTR,       // uint32[n] growth step index (simulation time)
  LS_H_FIELD_PTR,      // float32[n] normalised field at the moment of growth
  LS_H_SUBTREE_PTR,    // uint32[n] valid when attached
  LS_H_GDIST_PTR,      // float32[n] valid when attached
  LS_H_FLAGS_PTR,      // uint8[n]
  LS_H_MAIN_COUNT,
  LS_H_MAIN_PTR,       // uint32[m] node ids, root to ground
  LS_H_TOTAL_STEPS,
  LS_H_STALL_EVENTS,
  LS_H_FORCED_STEPS,
  LS_H_LONGEST_STALL,
  LS_H_SOLVE_SWEEPS,
  LS_H_CHARGE_COUNT,
  LS_H_CHARGE_PTR,     // float32[6k]: x, y, z, sigmaH, sigmaV, q
  LS_H_CLOUD_BASE,     // float bits, cell units
  LS_H_GROUND_COUNT,
  LS_H_GROUND_POS_PTR, // float32[2g] x,z in ground cells from the strike point
  LS_H_GROUND_PARENT_PTR,
  LS_H_GROUND_STEP_PTR,
  LS_H_GROUND_GRID,    // ground grid size (cells across)
  LS_H_LIVE_BYTES,     // bytes currently allocated by the simulation
  LS_H_COUNT
};

#define LS_API_VERSION 3u

#if defined(__wasm__)
#define LS_EXPORT(name) __attribute__((used, visibility("default"), export_name(#name)))
#else
#define LS_EXPORT(name)
#endif

extern "C" {
// Pointer to the header block (stable for the lifetime of the module).
LS_EXPORT(ls_header) uint32_t* ls_header();
// (Re)allocates the grid and starts a new run. Returns the state.
LS_EXPORT(ls_init) int32_t ls_init(int32_t nx, int32_t ny, int32_t nz, uint32_t seed, float eta);
// Restarts on the existing grid with a new seed. Returns the state.
LS_EXPORT(ls_reset) int32_t ls_reset(uint32_t seed);
// Bounded work. Returns the state and refreshes the header.
LS_EXPORT(ls_step) int32_t ls_step(int32_t budget);
// Frees everything.
LS_EXPORT(ls_destroy) void ls_destroy();
}

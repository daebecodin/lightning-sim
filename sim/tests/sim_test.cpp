// Native test and profiling harness for the simulation core and its C API.
//   sim_test                 run the checks
//   sim_test dump <seed> <nx> <ny> <nz> <out.ppm>   write a projection image
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "../bindings/wasm_api.h"
#include "lightning/platform.h"
#include "lightning/sim.h"

namespace {

int g_failures = 0;
#define CHECK(cond, ...)                                  \
  do {                                                    \
    if (!(cond)) {                                        \
      ++g_failures;                                       \
      std::printf("  FAIL %s:%d: ", __FILE__, __LINE__);  \
      std::printf(__VA_ARGS__);                           \
      std::printf("\n");                                  \
    }                                                     \
  } while (0)

double nowMs() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

uint64_t fnv(const void* p, size_t n, uint64_t h = 1469598103934665603ULL) {
  const unsigned char* b = static_cast<const unsigned char*>(p);
  for (size_t i = 0; i < n; ++i) h = (h ^ b[i]) * 1099511628211ULL;
  return h;
}

struct RunStats {
  uint32_t nodes, mainLen, steps, stalls, forced, longest, sweeps;
  double ms;
  uint64_t hash;
};

bool runToEnd(ls::LeaderSim& sim, RunStats* out) {
  const double t0 = nowMs();
  int guard = 0;
  while (sim.state() == ls::kSolving || sim.state() == ls::kGrowing) {
    sim.advance(64);
    if (++guard > 2000000) break;
  }
  out->ms = nowMs() - t0;
  out->nodes = sim.nodeCount();
  out->mainLen = sim.mainCount();
  out->steps = sim.totalSteps();
  out->stalls = sim.stallEvents();
  out->forced = sim.forcedSteps();
  out->longest = sim.longestStall();
  out->sweeps = sim.solveSweeps();
  uint64_t h = fnv(sim.positions(), sim.nodeCount() * 12u);
  h = fnv(sim.steps(), sim.nodeCount() * 4u, h);
  h = fnv(sim.parents(), sim.nodeCount() * 4u, h);
  out->hash = h;
  return sim.state() == ls::kAttached;
}

void validate(const ls::LeaderSim& sim) {
  const ls::Config& c = sim.config();
  const uint32_t n = sim.nodeCount();
  CHECK(n >= 3, "too few nodes: %u", n);
  const float* p = sim.positions();
  const int32_t* par = sim.parents();
  const uint32_t* st = sim.steps();
  const uint8_t* fl = sim.flags();
  CHECK(par[0] == -1 && (fl[0] & ls::kNodeRoot), "root malformed");
  CHECK(fl[n - 1] & ls::kNodeGround, "last node is not the ground node");
  CHECK(p[3 * (n - 1) + 1] == 0.0f, "ground node not at y = 0 (y=%f)", p[3 * (n - 1) + 1]);
  uint32_t groundNodes = 0;
  for (uint32_t i = 0; i < n; ++i) {
    CHECK(p[3 * i] >= 0 && p[3 * i] < c.nx && p[3 * i + 1] >= 0 && p[3 * i + 1] < c.ny && p[3 * i + 2] >= 0 &&
              p[3 * i + 2] < c.nz, "node %u out of bounds", i);
    if (i > 0) {
      CHECK(par[i] >= 0 && uint32_t(par[i]) < i, "parent of %u is not older", i);
      CHECK(st[i] >= st[par[i]], "step order broken at %u", i);
      const float dx = p[3 * i] - p[3 * par[i]], dy = p[3 * i + 1] - p[3 * par[i] + 1], dz = p[3 * i + 2] - p[3 * par[i] + 2];
      CHECK(dx * dx + dy * dy + dz * dz <= 3.001f, "segment %u longer than one cell diagonal", i);
      CHECK(sim.groundDist()[i] >= 0.0f, "ground distance missing at %u", i);
    }
    if (fl[i] & ls::kNodeGround) ++groundNodes;
  }
  CHECK(groundNodes == 1, "expected exactly one ground node, got %u", groundNodes);
  const uint32_t m = sim.mainCount();
  const uint32_t* mp = sim.mainPath();
  CHECK(m >= 2 && mp[0] == 0 && mp[m - 1] == n - 1, "main path endpoints wrong");
  for (uint32_t k = 1; k < m; ++k) {
    CHECK(uint32_t(par[mp[k]]) == mp[k - 1], "main path not contiguous at %u", k);
    CHECK(fl[mp[k]] & ls::kNodeMain, "main flag missing");
  }
  CHECK(sim.subtrees()[0] == n, "root subtree %u != node count %u", sim.subtrees()[0], n);
}

int dump(int argc, char** argv) {
  if (argc < 7) return 2;
  ls::Config cfg;
  cfg.seed = uint32_t(std::atoi(argv[2]));
  cfg.nx = std::atoi(argv[3]);
  cfg.ny = std::atoi(argv[4]);
  cfg.nz = std::atoi(argv[5]);
  if (argc > 7) cfg.eta = float(std::atof(argv[7]));
  ls::LeaderSim sim;
  sim.init(cfg);
  RunStats s;
  runToEnd(sim, &s);
  std::printf("seed %u: nodes %u main %u steps %u stalls %u forced %u longest %u %.0f ms\n", cfg.seed, s.nodes,
              s.mainLen, s.steps, s.stalls, s.forced, s.longest, s.ms);
  // side views (x-y and z-y) plus the ground figure, 4 px per cell
  const int S = 4, G = ls::GroundDischarge::kGrid;
  const int W = (cfg.nx + cfg.nz) * S + G * S, H = cfg.ny * S;
  std::vector<unsigned char> img(size_t(W) * H * 3, 8);
  auto plot = [&](int x, int y, int r, int g, int b) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    unsigned char* q = &img[(size_t(y) * W + x) * 3];
    q[0] = (unsigned char)r; q[1] = (unsigned char)g; q[2] = (unsigned char)b;
  };
  auto line = [&](float x0, float y0, float x1, float y1, int r, int g, int b) {
    for (int i = 0; i <= 8; ++i) {
      const float t = i / 8.0f;
      plot(int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t), r, g, b);
    }
  };
  const float* p = sim.positions();
  for (int y = 0; y < H; ++y) {  // cloud base marker
    if (y == H - int(sim.cloudBaseY() * S)) for (int x = 0; x < (cfg.nx + cfg.nz) * S; x += 2) plot(x, y, 40, 40, 60);
  }
  for (uint32_t i = 1; i < sim.nodeCount(); ++i) {
    const int32_t a = sim.parents()[i];
    const bool main = sim.flags()[i] & ls::kNodeMain, forced = sim.flags()[i] & ls::kNodeForced;
    const int r = forced ? 255 : (main ? 255 : 110), g = forced ? 80 : (main ? 255 : 130), b = forced ? 80 : 255;
    line(p[3 * a] * S, H - 1 - p[3 * a + 1] * S, p[3 * i] * S, H - 1 - p[3 * i + 1] * S, r, g, b);
    line((cfg.nx + p[3 * a + 2]) * S, H - 1 - p[3 * a + 1] * S, (cfg.nx + p[3 * i + 2]) * S, H - 1 - p[3 * i + 1] * S, r, g, b);
  }
  ls::GroundDischarge gd;
  float dx, dz;
  sim.approachDirection(&dx, &dz);
  gd.run(cfg.seed, dx, dz);
  std::printf("ground nodes %u\n", gd.nodeCount());
  const int ox = (cfg.nx + cfg.nz) * S + G * S / 2, oy = G * S / 2;
  for (uint32_t i = 1; i < gd.nodeCount(); ++i) {
    const int32_t a = gd.parents()[i];
    const float* q = gd.positions();
    line(ox + q[2 * a] * S, oy + q[2 * a + 1] * S, ox + q[2 * i] * S, oy + q[2 * i + 1] * S, 255, 160, 60);
  }
  FILE* f = std::fopen(argv[6], "wb");
  if (!f) return 3;
  std::fprintf(f, "P6\n%d %d\n255\n", W, H);
  std::fwrite(img.data(), 1, img.size(), f);
  std::fclose(f);
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "dump") == 0) return dump(argc, argv);

  struct Grid { int nx, ny, nz, seeds; const char* name; };
  const Grid grids[] = {{48, 96, 48, 40, "low"}, {64, 128, 64, 24, "medium"}, {96, 192, 96, 6, "high"}};

  std::printf("== every seed must reach the ground ==\n");
  for (const Grid& g : grids) {
    ls::LeaderSim sim;
    double total = 0, worst = 0;
    uint32_t minNodes = ~0u, maxNodes = 0, stalls = 0, forced = 0, longest = 0, sweeps = 0;
    for (int seed = 1; seed <= g.seeds; ++seed) {
      ls::Config cfg;
      cfg.nx = g.nx; cfg.ny = g.ny; cfg.nz = g.nz; cfg.seed = uint32_t(seed);
      if (seed == 1) sim.init(cfg); else sim.reset(uint32_t(seed));
      RunStats s;
      const bool ok = runToEnd(sim, &s);
      CHECK(ok, "%s seed %d did not attach (state %d)", g.name, seed, int(sim.state()));
      if (ok) validate(sim);
      total += s.ms; if (s.ms > worst) worst = s.ms;
      if (s.nodes < minNodes) minNodes = s.nodes;
      if (s.nodes > maxNodes) maxNodes = s.nodes;
      stalls += s.stalls; forced += s.forced; if (s.longest > longest) longest = s.longest; sweeps += s.sweeps;
    }
    std::printf("  %-6s %3dx%3dx%3d  %2d seeds  nodes %u..%u  avg %.0f ms  worst %.0f ms  avg solve sweeps %u  "
                "stall events %u  recovery steps %u  longest natural pause %u\n",
                g.name, g.nx, g.ny, g.nz, g.seeds, minNodes, maxNodes, total / g.seeds, worst, sweeps / g.seeds,
                stalls, forced, longest);
    sim.destroy();
  }

  std::printf("== determinism ==\n");
  {
    ls::Config cfg; cfg.seed = 7;
    ls::LeaderSim a, b;
    RunStats sa, sb, sc;
    a.init(cfg); runToEnd(a, &sa);
    b.init(cfg); runToEnd(b, &sb);
    CHECK(sa.hash == sb.hash, "same seed produced different geometry");
    b.reset(8); runToEnd(b, &sc);
    CHECK(sc.hash != sa.hash, "different seeds produced identical geometry");
    b.reset(7); runToEnd(b, &sc);
    CHECK(sc.hash == sa.hash, "reset to the same seed is not reproducible");
    std::printf("  seed 7 hash %016llx (stable across instances and resets)\n", (unsigned long long)sa.hash);
    a.destroy(); b.destroy();
  }

  std::printf("== stall recovery (hostile settings must still attach) ==\n");
  {
    // eta = 1 grows a dense bush that would wander for a very long time.
    ls::Config cfg; cfg.nx = 40; cfg.ny = 80; cfg.nz = 40; cfg.eta = 1.0f;
    ls::LeaderSim sim;
    uint32_t stalls = 0, forced = 0;
    for (uint32_t seed = 1; seed <= 6; ++seed) {
      cfg.seed = seed;
      if (seed == 1) sim.init(cfg); else sim.reset(seed);
      RunStats s;
      CHECK(runToEnd(sim, &s), "eta=1 seed %u did not attach", seed);
      validate(sim);
      stalls += s.stalls; forced += s.forced;
    }
    std::printf("  eta=1: 6 of 6 attached, stall events %u, recovery steps %u\n", stalls, forced);
    CHECK(stalls > 0, "stall detection never triggered under hostile settings");
    sim.destroy();
  }

  std::printf("== C API, repeated resets, memory ==\n");
  {
    CHECK(ls::platform::liveBytes() == 0, "leak before API test: %zu bytes", ls::platform::liveBytes());
    const uint32_t* h = ls_header();
    ls_init(48, 96, 48, 1, 0.0f);
    uint32_t plateau = 0;
    for (uint32_t i = 0; i < 60; ++i) {
      if (i) ls_reset(1 + i % 5);
      int guard = 0, st;
      // interrupt some runs half way to make sure a reset mid-run is safe
      const int limit = (i % 3 == 1) ? 5 : 1 << 30;
      while ((st = ls_step(40)) == 1 || st == 2) if (++guard >= limit) break;
      if (limit > 5) {
        CHECK(st == 3, "API run %u ended in state %d", i, st);
        CHECK(h[LS_H_GROUND_COUNT] > 50, "ground discharge too small: %u", h[LS_H_GROUND_COUNT]);
        CHECK(h[LS_H_MAIN_COUNT] > 10, "main path too short");
      }
      if (i == 20) plateau = h[LS_H_LIVE_BYTES];
      if (i > 20) CHECK(h[LS_H_LIVE_BYTES] <= plateau + plateau / 4, "memory keeps growing across resets: %u > %u", h[LS_H_LIVE_BYTES], plateau);
    }
    CHECK(h[LS_H_VERSION] == LS_API_VERSION, "header version");
    std::printf("  60 resets, live bytes plateau %u\n", plateau);
    // grid change
    ls_init(64, 128, 64, 3, 0.0f);
    int st; while ((st = ls_step(64)) == 1 || st == 2) {}
    CHECK(st == 3, "regrid run failed");
    ls_destroy();
    CHECK(ls::platform::liveBytes() == 0, "leak after destroy: %zu bytes", ls::platform::liveBytes());
    std::printf("  destroy leaves 0 live bytes\n");
  }

  std::printf(g_failures ? "\n%d CHECK(S) FAILED\n" : "\nall checks passed\n", g_failures);
  return g_failures ? 1 : 0;
}

// Production build: bundles the app and the worker with esbuild, copies the
// compiled WebAssembly module and static files into ../dist.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
// --three-cdn: leave three.js out of the bundle and load it from jsDelivr
// through an import map. Smaller, but needs network access at run time.
const threeFromCdn = process.argv.includes('--three-cdn');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const out = path.resolve(root, threeFromCdn ? '../dist-cdn' : '../dist');
const wasm = path.join(root, 'public/wasm/lightning_sim.wasm');

try {
  await access(wasm);
} catch {
  console.error('Missing web/public/wasm/lightning_sim.wasm. Build the simulation first: ./scripts/build-wasm.sh');
  process.exit(1);
}

// three.js is vendored in web/vendor/three, so the build needs no network.
const vendorThree = {
  name: 'vendor-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'vendor/three/build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: path.join(root, 'vendor/three/examples/jsm', args.path.slice('three/addons/'.length)),
    }));
  },
};

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'assets'), { recursive: true });

const common = {
  bundle: true, format: 'esm', minify: true, target: 'es2022', legalComments: 'none', logLevel: 'info',
  ...(threeFromCdn ? { external: ['three', 'three/addons/*'] } : { plugins: [vendorThree] }),
};
await build({
  ...common,
  entryPoints: { app: path.join(root, 'src/main.js') },
  outdir: path.join(out, 'assets'),
  define: { __LS_WORKER_URL__: '"assets/sim-worker.js"', __LS_WASM_URL__: '"wasm/lightning_sim.wasm"' },
});
await build({
  ...common,
  entryPoints: { 'sim-worker': path.join(root, 'src/sim/worker.js') },
  outdir: path.join(out, 'assets'),
});

await cp(path.join(root, 'src/ui/style.css'), path.join(out, 'assets/style.css'));
await mkdir(path.join(out, 'wasm'), { recursive: true });
await cp(wasm, path.join(out, 'wasm/lightning_sim.wasm'));
if (!threeFromCdn) await cp(path.join(root, 'vendor/three/LICENSE'), path.join(out, 'THREE-LICENSE.txt'));

let html = await readFile(path.join(root, 'index.html'), 'utf8');
const importMap = threeFromCdn
  ? `\n  <script type="importmap">\n  { "imports": { "three": "${THREE_CDN}build/three.module.js", "three/addons/": "${THREE_CDN}examples/jsm/" } }\n  </script>`
  : '';
html = html
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, importMap)
  .replace('href="src/ui/style.css"', 'href="assets/style.css"')
  .replace('src="src/main.js"', 'src="assets/app.js"');
await writeFile(path.join(out, 'index.html'), html);
console.log(`\nProduction build written to ${out}`);

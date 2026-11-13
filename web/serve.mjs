// Tiny static file server with the right MIME types for ES modules and
// WebAssembly. No dependencies.
//   node serve.mjs [directory] [port]
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 5173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(dir, path.normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir)) throw Object.assign(new Error('forbidden'), { code: 403 });
    let info = await stat(file);
    if (info.isDirectory()) { file = path.join(file, 'index.html'); info = await stat(file); }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch (err) {
    const code = err.code === 403 ? 403 : 404;
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(code === 403 ? 'Forbidden' : 'Not found');
  }
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));

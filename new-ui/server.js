import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root   = fileURLToPath(new URL('.', import.meta.url));
const parent = join(root, '..');
const port   = Number(process.env.PORT || 3002);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]))
    .replace(/^\.\.(\/|\\|$)/, '');

  // /public/* → project-root/public/*  (serves brain_loop_alpha.webm etc.)
  if (clean.startsWith('/public/')) {
    return join(parent, clean);
  }

  return join(root, clean === '/' ? 'index.html' : clean);
}

const server = createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || '/');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    const fallback = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fallback);
  }
});

server.listen(port, () => {
  console.log(`New UI running at http://localhost:${port}`);
});

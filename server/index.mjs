import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLiveBridge } from './live-bridge.mjs';
import { createDecartBridge } from './decart-bridge.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const decart = createDecartBridge({
  apiKey: process.env.DECART_API_KEY,
  model: process.env.DECART_MODEL || 'lucy-vton-3.6',
  maxSessionSeconds: process.env.DECART_MAX_SESSION_SECONDS
    ? Number(process.env.DECART_MAX_SESSION_SECONDS)
    : null,
  speed: process.env.DECART_SPEED === 'fast' ? 'fast' : 'standard',
  allowedOrigins: process.env.PUBLIC_WEB_ORIGIN
    ? [new URL(process.env.PUBLIC_WEB_ORIGIN).origin]
    : [],
  allowRemote: process.env.DECART_DEMO_ALLOW_REMOTE === 'true',
});
const bridge = createLiveBridge({
  apiOrigin: process.env.LOOKLUXE_API_ORIGIN || process.env.VITE_API_BASE_URL,
  allowedOrigins: process.env.PUBLIC_WEB_ORIGIN
    ? [new URL(process.env.PUBLIC_WEB_ORIGIN).origin]
    : [],
});
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  if (decart.handleRequest(req, res) || bridge.handleRequest(req, res)) return;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!extname(file)) file = resolve(root, 'index.html');
    if (!(await stat(file)).isFile()) throw new Error('not_found');
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=3600' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('upgrade', (req, socket, head) => {
  if (!decart.handleUpgrade(req, socket, head) && !bridge.handleUpgrade(req, socket, head))
    socket.destroy();
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5174);
server.listen(port, host, () => console.log(`Oyu AI web listening on http://${host}:${port}`));
const stop = async () => {
  await Promise.all([bridge.close(), decart.close()]);
  server.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

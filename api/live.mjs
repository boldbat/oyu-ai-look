import { createServer } from 'node:http';
import { createDecartBridge } from '../server/decart-bridge.mjs';
import { createLiveAuthorizer } from '../server/live-auth.mjs';

const allowedEmails = (process.env.LIVE_ALLOWED_EMAILS || '').split(',').filter(Boolean);
const allowedOrigins = (process.env.LIVE_ALLOWED_ORIGINS || 'https://oyu-ai-look.vercel.app')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (process.env.VERCEL_URL) allowedOrigins.push(`https://${process.env.VERCEL_URL}`);

const bridge = createDecartBridge({
  apiKey: allowedEmails.length ? process.env.DECART_API_KEY : '',
  model: process.env.DECART_MODEL || 'lucy-vton-3.6',
  allowRemote: true,
  allowedOrigins,
  directSocket: true,
  authorizeSession: createLiveAuthorizer({
    projectId: process.env.FIREBASE_PROJECT_ID || 'oyu-i-look',
    allowedEmails,
  }),
});

const server = createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!bridge.handleRequest(req, res)) {
    res.writeHead(404);
    res.end();
  }
});
server.on('upgrade', (req, socket, head) => {
  if (!bridge.handleUpgrade(req, socket, head)) socket.destroy();
});

export default server;

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createLiveBridge } from './server/live-bridge.mjs';
import { createDecartBridge } from './server/decart-bridge.mjs';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = env.LOOKLUXE_API_ORIGIN || env.VITE_API_BASE_URL || '';
  return {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin ? '/__lookluxe/api' : ''),
    },
    plugins: [
      react(),
      {
        name: 'lookluxe-live-bridge',
        configureServer(server) {
          const bridge = createLiveBridge({ apiOrigin });
          const decart = createDecartBridge({
            apiKey: env.DECART_API_KEY,
            model: env.DECART_MODEL || 'lucy-vton-3.6',
            allowedOrigins: env.PUBLIC_WEB_ORIGIN ? [new URL(env.PUBLIC_WEB_ORIGIN).origin] : [],
            allowRemote: env.DECART_DEMO_ALLOW_REMOTE === 'true',
          });
          server.middlewares.use((req, res, next) => {
            if (!decart.handleRequest(req, res) && !bridge.handleRequest(req, res)) next();
          });
          server.httpServer?.on('upgrade', (req, socket, head) => {
            if (!decart.handleUpgrade(req, socket, head)) bridge.handleUpgrade(req, socket, head);
          });
          server.httpServer?.on('close', () => {
            void bridge.close();
            void decart.close();
          });
        },
      },
    ],
    server: {
      port: 5174,
      strictPort: true,
      // Development-only path for the synthetic hosted gateway acceptance check.
      // The normal local Live screen continues to use its local ticket bridge.
      proxy: {
        '/api/live': {
          target: 'https://oyu-ai-look.vercel.app',
          changeOrigin: true,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});

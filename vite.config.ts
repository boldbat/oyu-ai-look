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
            maxSessionSeconds: env.DECART_MAX_SESSION_SECONDS
              ? Number(env.DECART_MAX_SESSION_SECONDS)
              : null,
            speed: env.DECART_SPEED === 'fast' ? 'fast' : 'standard',
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
    // Oyu's pose model is imported lazily; bundling it up front avoids a one-time page reload
    // (and a lost try-on selection) the first time the camera opens in development.
    optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
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

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The backend services do not send CORS headers for localhost, so in dev every
// API path is proxied to the cluster. In production the app is served from the
// same domain as the ingress (DEMO-PATH D-06), so no proxy is needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_PROXY_TARGET || 'http://13.202.147.103';
  const proxied = { target, changeOrigin: true };
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // One prefix per service (DEMO-PATH D-05). Only /api paths are proxied so
      // SPA routes such as /inbound stay with the app.
      proxy: Object.fromEntries(
        ['auth', 'billing', 'flow', 'telephony', 'inbound', 'outbound', 'analytics', 'integration'].flatMap((svc) => [
          [`/${svc}/api`, proxied],
          [`/${svc}/healthz`, proxied],
        ]),
      ),
    },
  };
});

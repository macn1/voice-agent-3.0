import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The backend services do not send CORS headers for localhost, so in dev every
// API path is proxied. In production the app is served from the same domain as
// the ingress (DEMO-PATH D-06), so no proxy is needed.
//
// Two dev targets:
// - default: the deployed cluster (VITE_PROXY_TARGET), where the ingress
//   routes /<service>/... to each service;
// - local (VITE_LOCAL_SERVICES=1): every service runs on this computer
//   (dev-ops/local/local.py), each on its own port, without the prefix.
const SERVICES = ['auth', 'billing', 'flow', 'telephony', 'inbound', 'outbound', 'analytics', 'integration', 'orchestrator'];
const LOCAL_PORTS = {
  auth: 8080,
  billing: 8081,
  flow: 8082,
  inbound: 8083,
  outbound: 8084,
  integration: 8085,
  analytics: 8086,
  telephony: 8087,
  realtime: 8088,
  orchestrator: 8089,
};

function clusterProxy(target) {
  const proxied = { target, changeOrigin: true };
  return Object.fromEntries([
    // One prefix per service (DEMO-PATH D-05). Only /api paths are proxied so
    // SPA routes such as /inbound stay with the app.
    ...SERVICES.flatMap((svc) => [
      [`/${svc}/api`, proxied],
      [`/${svc}/healthz`, proxied],
    ]),
    // Voice previews come from the media server.
    ['/realtime/v1/voices', proxied],
  ]);
}

function localProxy() {
  const to = (svc) => ({
    target: `http://localhost:${LOCAL_PORTS[svc]}`,
    changeOrigin: true,
    ws: svc === 'realtime',
    rewrite: (path) => path.replace(new RegExp(`^/${svc}`), ''),
  });
  return Object.fromEntries([
    ...SERVICES.flatMap((svc) => [
      [`/${svc}/api`, to(svc)],
      [`/${svc}/healthz`, to(svc)],
    ]),
    ['/realtime/v1', to('realtime')],
  ]);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const local = env.VITE_LOCAL_SERVICES === '1';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: local ? localProxy() : clusterProxy(env.VITE_PROXY_TARGET || 'http://13.202.147.103'),
    },
  };
});

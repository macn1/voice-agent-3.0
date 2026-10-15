import { resolve } from './engine';
import { markDemoServed } from './registry';
import './handlers/flow';
import './handlers/outbound';
import './handlers/analytics';
import './handlers/integration';
import './handlers/platform';

// Demo-data fallback (see DEMO-DATA.md). Consulted only after the real backend
// has said it doesn't serve a route. Turn it off with VITE_DEMO_FALLBACK=false
// to see exactly what the live API provides.
export const DEMO_FALLBACK = import.meta.env.VITE_DEMO_FALLBACK !== 'false';

// The flow service answers 403 when a platform admin token hits /customer/agents.
const adminFlowForbidden = (args, error) => args.realm === 'admin' && args.service === 'flow' && error?.status === 403;

/** Returns { data } or { error } when demo data answers the request, else null. */
export async function demoFallback(args, error, live) {
  if (!DEMO_FALLBACK || !(error?.notAvailable || adminFlowForbidden(args, error))) return null;
  const out = await resolve({ ...args, live });
  if (!out.handled) return null;
  markDemoServed(args);
  return out.error ? { error: out.error } : { data: out.data };
}

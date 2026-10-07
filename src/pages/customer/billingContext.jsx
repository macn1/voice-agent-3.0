import { useMemo } from 'react';
import { useGetSubscriptionQuery, useGetUsageQuery, useListPublicPackagesQuery } from '../../store/api/customerApi';
import { asList, normalizeUsage, packageOf } from '../../lib/normalize';

/**
 * Plan + usage for the top-bar meter, near-limit banner (CUS-08.3) and billing
 * pages. Backed by the shared RTK Query cache, so every caller reuses the same
 * requests and refreshes when a plan change invalidates 'Subscription'.
 */
export function useBilling() {
  const sub = useGetSubscriptionQuery();
  const pkgs = useListPublicPackagesQuery();
  const usageQ = useGetUsageQuery();

  return useMemo(() => {
    const subscription = sub.data ?? null;
    const catalog = asList(pkgs.data);
    const plan = packageOf(subscription, catalog);
    const usage = usageQ.data !== undefined ? normalizeUsage(usageQ.data) : undefined;
    const includedMinutes = usage?.includedMinutes ?? (plan ? Number(plan.included_call_minutes) : undefined);
    return {
      loaded: !sub.isLoading && !pkgs.isLoading && !usageQ.isLoading,
      subscription,
      catalog,
      plan,
      usage,
      includedMinutes,
      minutesRatio: includedMinutes && usage ? usage.callMinutes / includedMinutes : undefined,
    };
  }, [sub.data, sub.isLoading, pkgs.data, pkgs.isLoading, usageQ.data, usageQ.isLoading]);
}

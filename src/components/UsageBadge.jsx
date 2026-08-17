import { useEffect, useState } from 'react';
import { fetchSubscription, fetchUsage } from '../lib/subscription';
import { AI_USAGE_LIMITS } from '../lib/constants';

// A small, non-blocking "N left this month" line for free-plan users. Purely informational — the
// actual limit is enforced server-side in the matching Edge Function regardless of what this
// shows, so a stale or failed fetch here can never grant extra usage.
export default function UsageBadge({ userId, feature }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSubscription(userId), fetchUsage(userId)])
      .then(([sub, usage]) => {
        if (cancelled) return;
        setInfo({ plan: sub.plan, used: usage[feature], limit: AI_USAGE_LIMITS[sub.plan][feature] });
      })
      .catch(() => {}); // display-only — silently skip the badge if this fails
    return () => { cancelled = true; };
  }, [userId, feature]);

  if (!info || info.plan === 'pro') return null;
  const remaining = Math.max(0, info.limit - info.used);
  return <p className="usage-badge">{remaining} of {info.limit} free use{info.limit === 1 ? '' : 's'} left this month</p>;
}

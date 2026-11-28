import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, Phone, Timer } from 'lucide-react';
import { useListCampaignsQuery } from '../../store/api/flowApi';
import { useGetAnalyticsQuery } from '../../store/api/analyticsApi';
import { useListCallsQuery } from '../../store/api/callsApi';
import { useListConversationsQuery } from '../../store/api/integrationApi';
import { number } from '../../lib/format';
import { StatusBadge } from '../../components/ui';
import { AreaChart, Sparkline } from '../../components/charts';
import { useBilling } from './billingContext';

/**
 * P-06 Dashboard (ANA-F1, CUS-08) under the hero. Renders nothing for a
 * section whose service isn't deployed yet, so Home stays clean.
 */
export function HomeDashboard() {
  const navigate = useNavigate();
  const { minutesRatio, usage, includedMinutes } = useBilling();
  const summary = useGetAnalyticsQuery({ report: 'summary', range: '365d' });
  const ts = useGetAnalyticsQuery({ report: 'timeseries', range: '14d' });
  const failedQ = useListCallsQuery({ range: '1d', status: 'failed', limit: 1 });
  const flaggedQ = useListCallsQuery({ range: '7d', flagged: true, limit: 1 });
  const waitingQ = useListConversationsQuery({ status: 'needs_human' });
  const campaigns = useListCampaignsQuery({ limit: 6 });
  const failed = { data: failedQ.data?.total };
  const flagged = { data: flaggedQ.data?.total };
  const waiting = { data: waitingQ.data?.length };

  // Render nothing until at least one of these services is deployed.
  const allMissing = [summary, campaigns].every((s) => s.error?.notAvailable);
  if (allMissing) return null;

  const attention = [
    failed.data ? { count: failed.data, label: failed.data === 1 ? 'failed call today' : 'failed calls today', to: '/?range=today&status=failed#calls' } : null,
    flagged.data ? { count: flagged.data, label: flagged.data === 1 ? 'call to review' : 'calls to review', to: '/review' } : null,
    waiting.data ? { count: waiting.data, label: waiting.data === 1 ? 'chat needs a human' : 'chats need a human', to: '/inbox' } : null,
    minutesRatio !== undefined && minutesRatio >= 0.8
      ? { count: `${Math.round(minutesRatio * 100)}%`, label: 'of plan minutes used', to: '/settings/usage' }
      : null,
  ].filter(Boolean);

  const d = summary.data;
  const series = ts.data ?? [];
  const spark = (k) => series.map((r) => Number(r[k] ?? 0));
  const periodCalls = series.reduce((a, r) => a + Number(r.calls ?? 0), 0);
  const periodOk = series.reduce((a, r) => a + Number(r.successful ?? 0), 0);
  const avg = d ? `${Math.floor(d.avg_duration / 60)}:${String(Math.round(d.avg_duration % 60)).padStart(2, '0')}` : '';
  const rate = d ? Math.round(d.success_rate * 100) : 0;
  const minutesUsed = usage?.callMinutes ?? d?.minutes ?? 0;

  const kpis = d
    ? [
        {
          icon: Phone,
          tone: 'blue',
          label: 'Total calls',
          value: number(d.calls),
          hint: 'Last 12 months',
          spark: spark('calls'),
          onClick: () => document.getElementById('calls')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
        {
          icon: Timer,
          tone: 'orange',
          label: 'Minutes used',
          value: number(minutesUsed),
          hint: includedMinutes ? `of ${number(includedMinutes)} in your plan` : 'This billing period',
          meter: includedMinutes ? Math.min(1, minutesUsed / includedMinutes) : undefined,
          onClick: () => navigate('/settings/usage'),
        },
        {
          icon: CheckCircle2,
          tone: 'green',
          label: 'Success rate',
          value: `${rate}%`,
          hint: rate >= 60 ? 'Healthy' : rate >= 30 ? 'Room to improve' : 'Needs attention',
          spark: spark('successful'),
        },
        { icon: Clock, tone: 'amber', label: 'Avg call duration', value: avg, hint: 'minutes : seconds' },
      ]
    : [];

  return (
    <section className="dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">Overall at a glance</div>
          <h2 className="dash-title">Performance overview</h2>
        </div>
        <Link to="/analytics" className="btn sm ghost">
          Full analytics <ArrowRight size={14} />
        </Link>
      </div>

      {attention.length > 0 && (
        <div className="attn" role="status" aria-label="Needs attention">
          <span className="attn-title">
            <i className="attn-dot" /> Needs attention
          </span>
          <div className="attn-items">
            {attention.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="attn-item"
                onClick={() => sessionStorage.setItem('homeScrollY', String(window.scrollY))}
              >
                <b>{a.count}</b>
                <span>{a.label}</span>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {d && (
        <div className="dash-kpis">
          {kpis.map((k) => (
            <div key={k.label} className={`card dash-kpi tone-${k.tone}${k.onClick ? ' clickable' : ''}`} onClick={k.onClick}>
              <div className="dash-kpi-top">
                <span className="dash-kpi-icon">
                  <k.icon size={18} />
                </span>
                <span className="dash-kpi-label">{k.label}</span>
              </div>
              <div className="dash-kpi-value">{k.value}</div>
              <div className="dash-kpi-foot">
                <span className="dash-kpi-hint">{k.hint}</span>
                {k.spark && <Sparkline values={k.spark} color={`var(--tone-${k.tone})`} />}
              </div>
              {k.meter !== undefined && (
                <div className="bar dash-kpi-meter">
                  <span style={{ width: `${Math.max(2, k.meter * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="dash-main">
        {series.length > 0 && (
          <div className="card dash-panel">
            <div className="dash-panel-head">
              <div>
                <div className="card-title">Calls per day</div>
                <div className="card-sub">Last 14 days · hover for daily detail</div>
              </div>
              <div className="dash-chart-stats">
                <div>
                  <b>{number(periodCalls)}</b>
                  <span>calls</span>
                </div>
                <div>
                  <b>{number(periodOk)}</b>
                  <span>successful</span>
                </div>
                <div>
                  <b>{periodCalls ? Math.round((periodOk / periodCalls) * 100) : 0}%</b>
                  <span>success rate</span>
                </div>
              </div>
            </div>
            <div className="legend dash-legend">
              <span>
                <i style={{ background: 'var(--series-1)' }} />
                All calls
              </span>
              <span>
                <i style={{ background: 'var(--series-3)' }} />
                Successful
              </span>
            </div>
            <AreaChart
              data={series}
              x="day"
              height={250}
              series={[
                { key: 'calls', label: 'Calls' },
                { key: 'successful', label: 'Successful' },
              ]}
            />
          </div>
        )}
        {campaigns.data && campaigns.data.items.length > 0 && (
          <div className="card dash-panel">
            <div className="dash-panel-head">
              <div>
                <div className="card-title">Campaigns</div>
                <div className="card-sub">{campaigns.data.items.length} most recent</div>
              </div>
              <Link to="/campaigns" className="btn sm ghost">
                View all
              </Link>
            </div>
            <ul className="dash-camp-list">
              {campaigns.data.items.map((c) => (
                <li key={c.id} className="dash-camp" onClick={() => navigate(`/campaigns/${c.id}`)}>
                  <div className="dash-camp-main">
                    <div className="cell-main">{c.name}</div>
                    <div className="cell-sub">
                      {c.agent_name ?? 'No agent'} · {c.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

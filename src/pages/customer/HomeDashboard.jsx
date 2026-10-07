import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Flag, MessageSquare, PhoneOff } from 'lucide-react';
import { useListAgentsQuery } from '../../store/api/flowApi';
import { useGetAnalyticsQuery } from '../../store/api/analyticsApi';
import { useListCallsQuery } from '../../store/api/callsApi';
import { useListConversationsQuery } from '../../store/api/integrationApi';
import { number } from '../../lib/format';
import { Badge, StatusBadge } from '../../components/ui';
import { Stat, TimeChart } from '../../components/charts';
import { useBilling } from './billingContext';
import { CallsTable } from './calls/CallsPages';

/**
 * P-06 Dashboard (ANA-F1, CUS-08) under the hero. Renders nothing for a
 * section whose service isn't deployed yet, so Home stays clean.
 */
export function HomeDashboard() {
  const navigate = useNavigate();
  const { minutesRatio, usage, includedMinutes } = useBilling();
  const summary = useGetAnalyticsQuery({ report: 'summary', range: '1d' });
  const ts = useGetAnalyticsQuery({ report: 'timeseries', range: '14d' });
  const recent = useListCallsQuery({ range: '7d', limit: 10 });
  const failedQ = useListCallsQuery({ range: '1d', status: 'failed', limit: 1 });
  const flaggedQ = useListCallsQuery({ range: '7d', flagged: true, limit: 1 });
  const waitingQ = useListConversationsQuery({ status: 'needs_human' });
  const agents = useListAgentsQuery({ limit: 6 });
  const failed = { data: failedQ.data?.total };
  const flagged = { data: flaggedQ.data?.total };
  const waiting = { data: waitingQ.data?.length };

  // Render nothing until at least one of these services is deployed.
  const allMissing = [summary, recent, agents].every((s) => s.error?.notAvailable);
  if (allMissing) return null;

  const attention = [
    failed.data
      ? {
          icon: PhoneOff,
          text: `${failed.data} failed calls today`,
          to: '/calls?status=failed&range=1d',
        }
      : null,
    flagged.data
      ? {
          icon: Flag,
          text: `${flagged.data} calls flagged for review`,
          to: '/review',
        }
      : null,
    waiting.data
      ? {
          icon: MessageSquare,
          text: `${waiting.data} chats waiting for a human`,
          to: '/inbox',
        }
      : null,
    minutesRatio !== undefined && minutesRatio >= 0.8
      ? {
          icon: AlertTriangle,
          text: `${Math.round(minutesRatio * 100)}% of plan minutes used`,
          to: '/settings/usage',
        }
      : null,
  ].filter(Boolean);

  return (
    <section style={{ marginTop: 48, position: 'relative', zIndex: 1 }}>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Today at a glance</div>
        <Link to="/analytics" className="small row" style={{ gap: 4 }}>
          Analytics <ArrowRight size={14} />
        </Link>
      </div>
      {summary.data && (
        <div
          className="grid-3"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            marginBottom: 14,
          }}
        >
          <Stat label="Calls today" value={number(summary.data.calls)} onClick={() => navigate('/calls?range=1d')} />
          <Stat
            label="Minutes this period"
            value={number(usage?.callMinutes ?? summary.data.minutes)}
            hint={includedMinutes ? `of ${number(includedMinutes)} in your plan` : undefined}
            onClick={() => navigate('/settings/usage')}
          />
          <Stat label="Success rate" value={`${Math.round(summary.data.success_rate * 100)}%`} />
          <Stat
            label="Avg duration"
            value={`${Math.floor(summary.data.avg_duration / 60)}:${String(Math.round(summary.data.avg_duration % 60)).padStart(2, '0')}`}
          />
        </div>
      )}
      {attention.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>
            Needs attention
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {attention.map((a) => (
              <Link key={a.to} to={a.to} className="chip">
                <a.icon size={15} /> {a.text}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div
        className="grid-2"
        style={{
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          alignItems: 'start',
          marginBottom: 14,
        }}
      >
        {ts.data && ts.data.length > 0 && (
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 10 }}>
              Calls per day
            </div>
            <TimeChart
              data={ts.data}
              x="day"
              height={180}
              series={[
                { key: 'calls', label: 'Calls' },
                { key: 'successful', label: 'Successful' },
              ]}
            />
          </div>
        )}
        {agents.data && agents.data.items.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Agents</h2>
              <Link to="/agents" className="btn sm ghost">
                All
              </Link>
            </div>
            <table className="table">
              <tbody>
                {agents.data.items.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => navigate(`/agents/${a.id}`)}>
                    <td className="cell-main">{a.name}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="num muted">{a.calls_7d ?? 0} calls</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {recent.data && recent.data.items.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Recent calls</h2>
            <Link to="/calls" className="btn sm ghost">
              Call logs <Badge plain>{number(recent.data.total)}</Badge>
            </Link>
          </div>
          <CallsTable calls={recent.data.items} onOpen={(c) => navigate(`/calls/${c.id}`)} />
        </div>
      )}
    </section>
  );
}

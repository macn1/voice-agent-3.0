import { Link } from 'react-router-dom';
import { BookOpen, Code2, KeyRound, Webhook } from 'lucide-react';
import { PageHeader } from '../../components/ui';
import { PREFIX } from '../../store/api/services';

// DEV-02: API reference for the public endpoints a customer's developers use.
const REF = [
  {
    group: 'Calls',
    base: PREFIX.outbound,
    rows: [
      ['POST', '/api/v1/calls', 'Start an outbound call'],
      ['GET', '/api/v1/calls/{callId}', 'Call status'],
      ['POST', '/api/v1/calls/{callId}/hangup', 'End a call'],
    ],
  },
  {
    group: 'Call records',
    base: PREFIX.analytics,
    rows: [
      ['GET', '/api/v1/customer/calls', 'List calls (filters, pagination)'],
      ['GET', '/api/v1/customer/calls/{callId}', 'Call detail'],
      ['GET', '/api/v1/customer/calls/{callId}/transcript', 'Transcript'],
      ['GET', '/api/v1/customer/calls/{callId}/recording', 'Signed recording URL'],
    ],
  },
  {
    group: 'Contacts',
    base: PREFIX.outbound,
    rows: [
      ['GET', '/api/v1/customer/contacts', 'List contacts'],
      ['POST', '/api/v1/customer/contacts', 'Create or import contacts'],
      ['PATCH', '/api/v1/customer/contacts/{id}', 'Update a contact'],
    ],
  },
  {
    group: 'Campaigns',
    base: PREFIX.outbound,
    rows: [
      ['POST', '/api/v1/customer/campaigns', 'Create a campaign'],
      ['POST', '/api/v1/customer/campaigns/{id}/contacts', 'Add contacts'],
      ['POST', '/api/v1/customer/campaigns/{id}/start', 'Start'],
      ['GET', '/api/v1/customer/campaigns/{id}/results', 'Results'],
    ],
  },
  {
    group: 'Triggers',
    base: PREFIX.outbound,
    rows: [['POST', '/api/v1/hooks/triggers/{triggerKey}', 'Fire a call trigger (no auth; key in URL)']],
  },
  {
    group: 'Agents',
    base: PREFIX.flow,
    rows: [
      ['GET', '/api/v1/customer/agents', 'List agents'],
      ['GET', '/api/v1/customer/agents/{id}/export', 'Export an agent'],
    ],
  },
];

export function DocsPage() {
  return (
    <>
      <PageHeader eyebrow="Help" title="Documentation" description="Guides and the API reference for your developers." />
      <div className="grid-3" style={{ marginBottom: 18 }}>
        {[
          {
            to: '/welcome',
            icon: BookOpen,
            title: 'Getting started',
            text: 'Five steps to your first live call.',
          },
          {
            to: '/developers?tab=quickstart',
            icon: Code2,
            title: 'API quickstart',
            text: 'Start a call with one request.',
          },
          {
            to: '/developers?tab=keys',
            icon: KeyRound,
            title: 'API keys',
            text: 'Create and revoke keys.',
          },
          {
            to: '/developers?tab=webhooks',
            icon: Webhook,
            title: 'Webhooks',
            text: 'Receive call results.',
          },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="card card-pad row" style={{ gap: 14 }}>
            <span className="clay" style={{ width: 44, height: 44, borderRadius: 12 }}>
              <c.icon style={{ width: 20, height: 20 }} />
            </span>
            <span>
              <div className="cell-main">{c.title}</div>
              <div className="cell-sub">{c.text}</div>
            </span>
          </Link>
        ))}
      </div>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>API reference</h2>
            <div className="card-sub">
              All requests use <span className="mono">Authorization: Bearer &lt;API key&gt;</span> and return{' '}
              <span className="mono">{'{ success, data }'}</span> or <span className="mono">{'{ success: false, error: { code, message } }'}</span>.
            </div>
          </div>
        </div>
        {REF.map((g) => (
          <div key={g.group}>
            <div className="eyebrow" style={{ padding: '16px 20px 6px' }}>
              {g.group}
            </div>
            <table className="table">
              <tbody>
                {g.rows.map(([m, path, what]) => (
                  <tr key={m + path}>
                    <td style={{ width: 80 }}>
                      <span className="tag">{m}</span>
                    </td>
                    <td className="mono small">
                      {g.base}
                      {path}
                    </td>
                    <td className="muted">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}

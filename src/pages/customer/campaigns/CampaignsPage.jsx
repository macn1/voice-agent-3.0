import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, LayoutTemplate, Megaphone, PhoneIncoming, PhoneOutgoing, Plus, Search, Sparkles, Trash2, Upload, Zap } from 'lucide-react';
import { date, titleCase } from '../../../lib/format';
import {
  useDeleteCampaignMutation,
  useDuplicateCampaignMutation,
  useImportCampaignMutation,
  useListAgentsQuery,
  useListCampaignsQuery,
} from '../../../store/api/flowApi';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, PageHeader, SegmentTabs, StatusBadge, useToast } from '../../../components/ui';
import { readFileText, Select } from '../../../components/forms';

const CREATE_OPTIONS = [
  { to: '/campaigns/new?mode=blank&type=inbound', icon: PhoneIncoming, title: 'Inbound', text: 'Answer calls to your numbers: reception, support, bookings.' },
  { to: '/campaigns/new?mode=blank&type=outbound', icon: PhoneOutgoing, title: 'Outbound', text: 'Call a list of numbers: reminders, follow-ups, collections.' },
  { to: '/campaigns/new', icon: LayoutTemplate, title: 'From a template', text: 'Start from a ready-made campaign, e.g. Appointment reminder.' },
  { to: '/campaigns/new?mode=describe', icon: Sparkles, title: 'Describe it', text: 'Explain the job in a line and get a draft.' },
];

/** Campaigns: what the calls are for, inbound or outbound, each spoken by an agent. */
export function CampaignsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const type = ['inbound', 'outbound'].includes(params.get('type')) ? params.get('type') : '';
  const [q, setQ] = useState('');
  const list = useListCampaignsQuery({ limit: 200, ...(type ? { direction: type } : {}) });
  const [duplicate] = useDuplicateCampaignMutation();
  const [remove] = useDeleteCampaignMutation();
  const [removing, setRemoving] = useState(null);
  const [importing, setImporting] = useState(false);

  const items = list.data?.items ?? [];
  const usage = list.data?.usage;
  const limit = Number(usage?.limit ?? 0);
  const atLimit = limit > 0 && Number(usage?.used ?? 0) >= limit;
  const needle = q.trim().toLowerCase();
  const rows = items.filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.agent_name ?? '').toLowerCase().includes(needle));
  const none = list.isSuccess && !items.length && !type;

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Campaigns"
        description="What your calls are for. Inbound campaigns answer your numbers; outbound ones call a list. Each is spoken by one of your agents."
        actions={
          <>
            <Link to="/workflows" className="btn ghost" title="Start calls from your website, CRM or API, and scheduled calls">
              <Zap size={16} /> Call triggers
            </Link>
            <Button icon={<Upload />} onClick={() => setImporting(true)} disabled={atLimit}>
              Import
            </Button>
            <Button
              variant="primary"
              icon={<Plus />}
              disabled={atLimit}
              title={atLimit ? `Your plan allows ${limit} campaigns` : undefined}
              onClick={() => navigate('/campaigns/new')}
            >
              New campaign
            </Button>
          </>
        }
      />
      {usage && (
        <p className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>
          {limit > 0 ? `${usage.used} of ${limit} campaigns on your plan` : `${usage.used} campaign${usage.used === 1 ? '' : 's'} (no limit on your plan)`}
        </p>
      )}
      {atLimit && (
        <div className="banner warn">
          <span className="grow">
            Your plan allows {limit} campaign{limit === 1 ? '' : 's'} and you have {usage.used}. Delete one or move to a bigger plan to add another.
          </span>
          <Link to="/settings/plan" className="btn sm">
            Plans
          </Link>
        </div>
      )}

      {none ? (
        <section className="page-section">
          <div className="card card-pad">
            <div className="row" style={{ gap: 10, marginBottom: 6 }}>
              <Megaphone size={18} />
              <h2 style={{ margin: 0 }}>Create your first campaign</h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>Pick how it starts. You choose the agent who speaks on the next step.</p>
            <div className="usecase-grid" style={{ marginTop: 12 }}>
              {CREATE_OPTIONS.map((o) => (
                <button key={o.title} className="usecase" disabled={atLimit} onClick={() => navigate(o.to)}>
                  <span className="clay">
                    <o.icon />
                  </span>
                  <span>
                    <h3>{o.title}</h3>
                    <p>{o.text}</p>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="card">
          <div className="card-head">
            <div className="filters">
              <SegmentTabs
                value={type}
                onChange={(v) => setParams(v ? { type: v } : {}, { replace: true })}
                items={[
                  { value: '', label: 'All' },
                  { value: 'inbound', label: 'Inbound' },
                  { value: 'outbound', label: 'Outbound' },
                ]}
              />
              <div className="search">
                <Search />
                <Input placeholder="Search campaigns or agents" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </div>
          <Async state={list}>
            {() =>
              rows.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Type</th>
                        <th>Agent</th>
                        <th>Status</th>
                        <th>Last published</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id} className="clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                          <td className="cell-main">{c.name}</td>
                          <td>
                            <Badge plain>{titleCase(c.direction)}</Badge>
                          </td>
                          <td>
                            {c.agent_name ? (
                              <>
                                <div>{c.agent_name}</div>
                                {c.agent_role && <div className="cell-sub">{c.agent_role}</div>}
                              </>
                            ) : (
                              <span style={{ color: 'var(--red)' }}>No agent</span>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <StatusBadge status={c.status} />
                              {c.has_unpublished_changes && <Badge tone="orange">Unpublished changes</Badge>}
                            </div>
                          </td>
                          <td className="muted">{c.last_published_at ? date(c.last_published_at) : 'Never'}</td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Copy />}
                              title="Duplicate"
                              disabled={atLimit}
                              onClick={async () => {
                                try {
                                  const d = await duplicate({ id: c.id }).unwrap();
                                  toast(`Duplicated as ${d.name}`);
                                } catch (e) {
                                  toast(errMsg(e), 'error');
                                }
                              }}
                            />
                            <Button size="sm" variant="ghost" icon={<Trash2 />} title="Delete" onClick={() => setRemoving(c)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={items.length ? 'No campaigns match' : `No ${type} campaigns yet`} description={items.length ? 'Try another search.' : undefined} />
              )
            }
          </Async>
        </div>
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={(c) => navigate(`/campaigns/${c.id}`)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name}?`}
        description="Its calls stop and its phone numbers are left without a campaign. Call history is kept."
        confirmLabel="Delete campaign"
        onConfirm={async () => {
          try {
            await remove(removing.id).unwrap();
            toast('Campaign deleted');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />
    </>
  );
}

/** Import a campaign export (or an agent export from before campaigns), run by one of your agents. */
function ImportDialog({ open, onClose, onDone }) {
  const toast = useToast();
  const agents = useListAgentsQuery({ limit: 200 });
  const [file, setFile] = useState(null);
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState(null);
  const [importCampaign, { isLoading }] = useImportCampaignMutation();
  const fileRef = useRef(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a campaign"
      description="From an exported campaign file. Pick the agent who speaks on it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={isLoading}
            onClick={async () => {
              if (!file) return setError('Choose the export file');
              if (!agentId) return setError('Pick the agent');
              setError(null);
              try {
                const c = await importCampaign({ agent_id: agentId, export: file.data }).unwrap();
                toast(`Imported ${c.name}`);
                onClose();
                onDone(c);
              } catch (e) {
                setError(errMsg(e));
              }
            }}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setFile({ name: f.name, data: JSON.parse(await readFileText(f)) });
              setError(null);
            } catch {
              setError('That file is not a valid campaign export');
            }
          }}
        />
        <Field label="Export file">
          <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
            {file ? file.name : 'Choose a file'}
          </Button>
        </Field>
        <Field label="Agent">
          <Select
            value={agentId}
            options={(agents.data?.items ?? []).map((a) => ({ value: a.id, label: a.role ? `${a.name} · ${a.role}` : a.name }))}
            placeholder="Choose an agent"
            onChange={(e) => setAgentId(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

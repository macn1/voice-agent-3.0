import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Download, Plus, Search, Trash2, Upload, UserRound } from 'lucide-react';
import { date } from '../../../lib/format';
import {
  useDeleteAgentMutation,
  useDuplicateAgentMutation,
  useImportAgentMutation,
  useLazyExportAgentQuery,
  useListAgentsQuery,
} from '../../../store/api/flowApi';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Input, PageHeader, StatusBadge, useToast } from '../../../components/ui';
import { downloadText, readFileText, Select } from '../../../components/forms';
import { useBilling } from '../billingContext';

export function AgentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { plan } = useBilling();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const list = useListAgentsQuery({ limit: 200 });
  const [importAgent] = useImportAgentMutation();
  const [duplicateAgent] = useDuplicateAgentMutation();
  const [deleteAgent] = useDeleteAgentMutation();
  const [exportAgent] = useLazyExportAgentQuery();
  const [removing, setRemoving] = useState(null);
  const fileRef = useRef(null);

  const items = list.data?.items ?? [];
  const tags = useMemo(() => [...new Set(items.flatMap((a) => a.tags ?? []))], [items]);
  const limit = plan ? Number(plan.included_agents) : undefined;
  const atLimit = limit !== undefined && limit > 0 && (list.data?.total ?? items.length) >= limit;

  const rows = items.filter(
    (a) => (!q || a.name.toLowerCase().includes(q.toLowerCase())) && (!status || a.status === status) && (!tag || a.tags?.includes(tag)),
  );

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Agents"
        description="Every voice agent in your company. Edits go to a draft; calls keep using the published version until you publish."
        actions={
          <>
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
                  const config = JSON.parse(await readFileText(f));
                  const a = await importAgent(config).unwrap();
                  toast(`Imported ${a.name}`);
                  navigate(`/agents/${a.id}`);
                } catch (err) {
                  toast(err instanceof SyntaxError ? 'That file is not a valid agent export' : errMsg(err), 'error');
                }
              }}
            />

            <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <Button
              variant="primary"
              icon={<Plus />}
              disabled={atLimit}
              title={atLimit ? `Your plan includes ${limit} agents` : undefined}
              onClick={() => navigate('/agents/new')}
            >
              New agent
            </Button>
          </>
        }
      />

      {atLimit && (
        <div className="banner warn">
          <span className="grow">You've reached your plan's limit of {limit} agents.</span>
          <Link to="/settings/plan" className="btn sm">
            Upgrade plan
          </Link>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <div className="filters">
            <div className="search">
              <Search />
              <Input placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} options={['draft', 'live', 'paused']} placeholder="All statuses" onChange={(e) => setStatus(e.target.value)} />
            {tags.length > 0 && <Select value={tag} options={tags} placeholder="All tags" onChange={(e) => setTag(e.target.value)} />}
          </div>
        </div>
        <Async state={list}>
          {() =>
            rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Language</th>
                      <th>Status</th>
                      <th>Numbers</th>
                      <th className="num">Calls (7d)</th>
                      <th>Last published</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="clickable" onClick={() => navigate(`/agents/${a.id}`)}>
                        <td>
                          <div className="cell-main">{a.name}</div>
                          <div className="tag-list" style={{ marginTop: 4 }}>
                            {a.tags?.map((t) => (
                              <span key={t} className="tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="muted">{a.language ?? '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <StatusBadge status={a.status} />
                            {a.has_unpublished_changes && <Badge tone="orange">Unpublished changes</Badge>}
                          </div>
                        </td>
                        <td className="mono small">{a.numbers?.length ? a.numbers.join(', ') : <span className="muted">—</span>}</td>
                        <td className="num">{a.calls_7d ?? 0}</td>
                        <td className="muted">{a.last_published_at ? date(a.last_published_at) : 'Never'}</td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Copy />}
                            title="Duplicate"
                            onClick={async () => {
                              try {
                                const d = await duplicateAgent(a.id).unwrap();
                                toast(`Duplicated as ${d.name}`);
                              } catch (e) {
                                toast(errMsg(e), 'error');
                              }
                            }}
                          />

                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Download />}
                            title="Export"
                            onClick={async () => {
                              try {
                                downloadText(
                                  `${a.name.replace(/\W+/g, '-')}.json`,
                                  JSON.stringify(await exportAgent(a.id).unwrap(), null, 2),
                                  'application/json',
                                );
                              } catch (e) {
                                toast(errMsg(e), 'error');
                              }
                            }}
                          />

                          <Button size="sm" variant="ghost" icon={<Trash2 />} title="Delete" onClick={() => setRemoving(a)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<UserRound />}
                title={items.length ? 'No agents match' : 'No agents yet'}
                description={items.length ? 'Try another search or filter.' : 'Start from a template, describe what you need, or begin blank.'}
                action={
                  !items.length && (
                    <Button variant="primary" icon={<Plus />} onClick={() => navigate('/agents/new')}>
                      New agent
                    </Button>
                  )
                }
              />
            )
          }
        </Async>
      </div>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name}?`}
        description="Agents attached to a phone number or a running campaign can't be deleted — detach them first."
        confirmLabel="Delete agent"
        onConfirm={async () => {
          await deleteAgent(removing.id).unwrap();
          toast('Agent deleted');
        }}
      />
    </>
  );
}

import { useEffect, useState } from 'react';
import { FlaskConical, KeyRound, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { dateTime } from '../../../lib/format';
import { useCreateToolMutation, useDeleteToolMutation, useListToolsQuery, useTestToolMutation, useUpdateToolMutation } from '../../../store/api/flowApi';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, PageHeader, useToast } from '../../../components/ui';
import { MappingEditor, Select, Textarea } from '../../../components/forms';

/** P-13 Tools (ACT-01). */
export function ToolsPage() {
  const toast = useToast();
  const list = useListToolsQuery();
  const [deleteTool] = useDeleteToolMutation();
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState(null);
  const [removing, setRemoving] = useState(null);

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="Let agents call your systems mid-conversation — check an order, look up slots, create a ticket."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            New tool
          </Button>
        }
      />

      <div className="card">
        <Async state={list}>
          {(tools) =>
            tools.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Endpoint</th>
                    <th className="num">Agents</th>
                    <th>Last call</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="cell-main mono">{t.name}</div>
                        <div className="cell-sub">{t.description}</div>
                      </td>
                      <td className="mono small">
                        <Badge plain>{t.method}</Badge> {t.url}
                      </td>
                      <td className="num">{t.agents_count ?? 0}</td>
                      <td>
                        {t.last_status ? (
                          <Badge tone={t.last_status.startsWith('2') ? 'green' : 'red'}>{t.last_status}</Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<FlaskConical />} onClick={() => setTesting(t)}>
                          Test
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(t)} />
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                icon={<Wrench />}
                title="No tools yet"
                description="Connect an API your agents can use during calls."
                action={
                  <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
                    New tool
                  </Button>
                }
              />
            )
          }
        </Async>
      </div>
      <ToolEditor value={editing} onClose={() => setEditing(null)} onSaved={() => toast('Tool saved')} />

      <ToolTester tool={testing} onClose={() => setTesting(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name}?`}
        description="Agents using it will no longer be able to call it."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteTool(removing.id).unwrap();
        }}
      />
    </>
  );
}

function ToolEditor({ value, onClose, onSaved }) {
  const isNew = value === 'new';
  const [createTool] = useCreateToolMutation();
  const [updateTool] = useUpdateToolMutation();
  const blank = {
    name: '',
    description: '',
    method: 'POST',
    url: '',
    headers: {},
    parameters: [],
    wait_message: 'One moment, let me check that.',
    timeout_ms: 5000,
  };
  const [t, setT] = useState(blank);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (value) {
      setT(value === 'new' ? blank : { ...value });
      setSecret('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const params = t.parameters ?? [];
  const setParam = (i, p) =>
    setT({
      ...t,
      parameters: params.map((x, j) => (j === i ? { ...x, ...p } : x)),
    });

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      wide
      title={isNew ? 'New tool' : `Edit ${t.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!/^[a-z][a-z0-9_]*$/.test(t.name ?? '')) return setError('Name: lowercase letters, numbers and underscores, e.g. lookup_order');
              if (!t.description?.trim()) return setError('Describe when the agent should use this tool');
              if (!/^https:\/\//.test(t.url ?? '')) return setError('The URL must start with https://');
              setBusy(true);
              setError(null);
              try {
                const body = { ...t, ...(secret ? { secret } : {}) };
                if (isNew) await createTool(body).unwrap();
                else await updateTool({ id: value.id, ...body }).unwrap();
                onSaved();
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save tool
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Name">
            <Input className="mono" placeholder="lookup_order" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          </Field>
          <Field label="Timeout (ms)">
            <Input type="number" min={500} max={20000} value={t.timeout_ms} onChange={(e) => setT({ ...t, timeout_ms: Number(e.target.value) })} />
          </Field>
          <Field label="When should the agent use this?" className="full">
            <Textarea rows={2} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={t.method} options={['GET', 'POST', 'PUT', 'PATCH']} onChange={(e) => setT({ ...t, method: e.target.value })} />
          </Field>
          <Field label="URL">
            <Input className="mono" placeholder="https://api.example.com/orders" value={t.url} onChange={(e) => setT({ ...t, url: e.target.value })} />
          </Field>
          <Field label="Line to say while waiting" className="full">
            <Input value={t.wait_message} onChange={(e) => setT({ ...t, wait_message: e.target.value })} />
          </Field>
        </div>
        <Field label="Headers (not secret)">
          <MappingEditor value={t.headers ?? {}} onChange={(headers) => setT({ ...t, headers })} keyLabel="Header" valueLabel="Value" addLabel="Add header" />
        </Field>
        <Field
          label="Authorization secret"
          hint={t.has_secret ? 'A secret is saved and hidden. Enter a new one to replace it.' : 'Sent as the Authorization header. Hidden after saving.'}
        >
          <div className="input-wrap">
            <Input
              type="password"
              placeholder={t.has_secret ? '••••••••  (saved)' : 'Bearer sk_live_…'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <span className="input-icon">
              <KeyRound />
            </span>
          </div>
        </Field>
        <div className="field">
          <div className="row between">
            <span className="field-label">Parameters the agent must collect</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() =>
                setT({
                  ...t,
                  parameters: [
                    ...params,
                    {
                      name: '',
                      type: 'string',
                      description: '',
                      required: true,
                    },
                  ],
                })
              }
            >
              Add parameter
            </Button>
          </div>
          {params.map((p, i) => (
            <div key={i} className="row wrap" style={{ gap: 8 }}>
              <input
                className="input mono"
                style={{ flex: 1, minWidth: 120 }}
                placeholder="order_id"
                value={p.name}
                onChange={(e) => setParam(i, { name: e.target.value })}
              />
              <Select
                style={{ width: 120 }}
                value={p.type}
                options={['string', 'number', 'boolean', 'date']}
                onChange={(e) => setParam(i, { type: e.target.value })}
              />
              <input
                className="input"
                style={{ flex: 2, minWidth: 160 }}
                placeholder="What it is"
                value={p.description}
                onChange={(e) => setParam(i, { description: e.target.value })}
              />
              <label className="check">
                <input type="checkbox" checked={p.required} onChange={(e) => setParam(i, { required: e.target.checked })} />
                Required
              </label>
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setT({ ...t, parameters: params.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** ACT-01.8 test runner showing request and response. */
function ToolTester({ tool, onClose }) {
  const [testTool] = useTestToolMutation();
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setValues({});
    setResult(null);
    setError(null);
  }, [tool]);
  return (
    <Modal
      open={!!tool}
      onClose={onClose}
      wide
      title={`Test ${tool?.name ?? ''}`}
      description="Calls your real endpoint with these sample values."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            icon={<FlaskConical />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setResult(await testTool({ id: tool.id, params: values }).unwrap());
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          {tool?.parameters.map((p) => (
            <Field key={p.name} label={`${p.name}${p.required ? ' *' : ''}`} hint={p.description}>
              <Input value={values[p.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))} />
            </Field>
          ))}
        </div>
        {result && (
          <div className="grid-2">
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Request
              </div>
              <pre className="code">{`${result.request.method} ${result.request.url}\n\n${JSON.stringify(result.request.body, null, 2)}`}</pre>
            </div>
            <div>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="field-label">Response</span>
                <span className="muted small">
                  <Badge tone={result.response.status < 300 ? 'green' : 'red'}>{result.response.status}</Badge> {result.duration_ms} ms
                </span>
              </div>
              <pre className="code">{JSON.stringify(result.response.body, null, 2)}</pre>
            </div>
          </div>
        )}
        {tool?.updated_at && <p className="muted small">Last edited {dateTime(tool.updated_at)}</p>}
      </div>
    </Modal>
  );
}

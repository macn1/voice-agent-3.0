import { useState } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, titleCase } from '../../lib/format';
import { asList } from '../../lib/normalize';
import { useCreateAdminTemplateMutation, useListAdminTemplatesQuery } from '../../store/api/adminApi';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, useToast } from '../../components/ui';
import { Select, Textarea } from '../../components/forms';

// Agent templates customers can start from (GET/POST /flow/api/v1/admin/agent-templates).

const USE_CASES = ['reception', 'support', 'sales', 'outbound_reminder'];
const SAMPLE = JSON.stringify(
  {
    flow: { greeting: 'Hello, how can I help?', system_prompt: 'You answer calls for {{company_name}}.' },
    variables: [{ name: 'company_name', default: 'our company' }],
  },
  null,
  2,
);

export function AdminTemplatesPage() {
  const { can } = useAuth();
  const list = useListAdminTemplatesQuery();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Agent templates"
        description="Starting points customers can pick when they create an agent."
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            disabled={!can('template.manage')}
            title={can('template.manage') ? undefined : 'Needs the template.manage permission'}
            onClick={() => setCreating(true)}
          >
            New template
          </Button>
        }
      />
      <div className="card">
        <Async state={list}>
          {(data) => {
            const rows = asList(data);
            if (!rows.length) return <EmptyState icon={<LayoutTemplate />} title="No templates yet" description="Create the first one." />;
            return (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Use case</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="cell-main">{t.name}</div>
                          <div className="cell-sub">{t.description}</div>
                        </td>
                        <td>{titleCase(t.use_case ?? '')}</td>
                        <td>{t.is_active === false ? <Badge plain>Hidden</Badge> : <Badge tone="green">Active</Badge>}</td>
                        <td className="muted">{date(t.updated_at ?? t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </Async>
      </div>
      <CreateTemplateModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateTemplateModal({ open, onClose }) {
  const toast = useToast();
  const [create, { isLoading }] = useCreateAdminTemplateMutation();
  const [f, setF] = useState({ name: '', use_case: 'reception', description: '', config: SAMPLE });
  const [error, setError] = useState(null);
  const submit = async () => {
    let config;
    try {
      config = JSON.parse(f.config);
    } catch {
      return setError('The configuration is not valid JSON.');
    }
    if (!f.name.trim()) return setError('Enter a name.');
    setError(null);
    try {
      await create({ name: f.name.trim(), use_case: f.use_case, description: f.description.trim(), config }).unwrap();
      toast('Template created');
      setF({ name: '', use_case: 'reception', description: '', config: SAMPLE });
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="New agent template"
      description="The configuration holds draft sections by name (flow, persona, behaviour, variables…), like an agent export."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={isLoading} onClick={submit}>
            Create template
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Use case">
            <Select value={f.use_case} options={USE_CASES} onChange={(e) => setF({ ...f, use_case: e.target.value })} />
          </Field>
          <Field label="Description" className="full">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Configuration (JSON)" className="full">
            <Textarea className="mono" rows={10} value={f.config} onChange={(e) => setF({ ...f, config: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

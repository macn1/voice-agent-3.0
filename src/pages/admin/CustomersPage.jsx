import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, slugify } from '../../lib/format';
import { asList, listTotal } from '../../lib/normalize';
import { useCreateCustomerMutation, useListCustomersQuery } from '../../store/api/adminApi';
import { Async, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, Pager, StatusBadge, useToast } from '../../components/ui';

const PAGE = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const customers = useListCustomersQuery({ limit: PAGE, offset });

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Customers"
        description="Every company on Aurlynn. Open one to manage its plan, domains, settings and billing."
        actions={
          can('customer.create') && (
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              New customer
            </Button>
          )
        }
      />

      <div className="card">
        <div className="card-head">
          <h2>All customers</h2>
          <div className="search">
            <Search />
            <Input placeholder="Filter this page by name or slug" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <Async state={customers}>
          {(data) => {
            const all = asList(data);
            const q = query.trim().toLowerCase();
            const rows = all.filter((t) => !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
            return (
              <>
                {rows.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Company</th>
                          <th>Slug</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t) => (
                          <tr key={t.id} className="clickable" onClick={() => navigate(`/admin/customers/${t.id}`)}>
                            <td>
                              <div className="row">
                                <span className="avatar sm soft">{t.name.slice(0, 1).toUpperCase()}</span>
                                <span className="cell-main">{t.name}</span>
                              </div>
                            </td>
                            <td className="mono muted">{t.slug}</td>
                            <td>
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="muted">{date(t.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={<Building2 />}
                    title={q ? 'No matches on this page' : 'No customers yet'}
                    description={q ? 'Try another name, or move between pages.' : 'Create the first company to get started.'}
                  />
                )}
                <Pager offset={offset} limit={PAGE} count={all.length} total={listTotal(data)} onChange={setOffset} />
              </>
            );
          }}
        </Async>
      </div>

      <CreateCustomerModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          if (t?.id) navigate(`/admin/customers/${t.id}`);
        }}
      />
    </>
  );
}

function CreateCustomerModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createCustomer] = useCreateCustomerMutation();

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugEdited(false);
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const withOwner = !!(ownerName || ownerEmail || ownerPassword);
  const errs = {
    name: !name.trim() ? 'Enter the company name' : null,
    slug: !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? 'Lowercase letters, numbers and dashes' : null,
    ownerName: withOwner && !ownerName.trim() ? 'Enter the owner name' : null,
    ownerEmail: withOwner && !EMAIL_RE.test(ownerEmail) ? 'Enter a valid email' : null,
    ownerPassword: withOwner && ownerPassword.length < 8 ? 'At least 8 characters' : null,
  };
  const show = (k) => (touched ? errs[k] : null);

  const submit = async () => {
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      const t = await createCustomer({
        name: name.trim(),
        slug,
        ...(withOwner
          ? {
              owner_name: ownerName.trim(),
              owner_email: ownerEmail.trim(),
              owner_password: ownerPassword,
            }
          : {}),
      }).unwrap();
      toast(`${name.trim()} created`);
      onClose();
      onCreated(t);
    } catch (e) {
      const msg = errMsg(e);
      setError(/slug|exists|duplicate|conflict/i.test(msg) ? `That slug is already taken. ${msg}` : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="New customer"
      description="The company starts on a trial. Optionally create its first admin login in the same step."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Create customer
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Company name" error={show('name')}>
            <Input
              autoFocus
              value={name}
              invalid={!!show('name')}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Slug" error={show('slug')} hint="Used in URLs; must be unique.">
            <Input
              className="mono"
              value={slug}
              invalid={!!show('slug')}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </Field>
        </div>
        <div className="perm-group" style={{ paddingTop: 18 }}>
          <h4>First admin login (optional)</h4>
          <div className="form-grid">
            <Field label="Owner name" error={show('ownerName')}>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <Field label="Owner email" error={show('ownerEmail')}>
              <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </Field>
            <Field label="Temporary password" error={show('ownerPassword')} className="full" hint="Share it with the owner securely.">
              <Input className="mono" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { AlertTriangle, Globe, Plus, Trash2, Wand2 } from 'lucide-react';
import { useGetCompanyProfileQuery, useImportCompanyFromWebsiteMutation, usePutCompanyProfileMutation } from '../../../store/api/flowApi';
import { Button, errMsg, Field, Input, Modal, PageHeader } from '../../../components/ui';
import { SectionCard, Textarea, useSection } from '../../../components/forms';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function completeness(p) {
  const missing = [];
  if (!p.about.description) missing.push('About');
  if (!p.offerings.length) missing.push('Products and services');
  if (!Object.keys(p.hours).length) missing.push('Opening hours');
  if (!p.contact.phone && !p.contact.email) missing.push('Contact details');
  if (!p.policies.cancellation && !p.policies.refund) missing.push('Policies');
  return missing;
}

/** P-11 Company profile (AGT-08). */
export function CompanyProfilePage() {
  const s = useSection(useGetCompanyProfileQuery(), usePutCompanyProfileMutation());
  const [importing, setImporting] = useState(false);
  const missing = s.draft ? completeness(s.draft) : [];

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Company profile"
        description="Enter your business facts once. Every agent answers from them, so they never make things up."
        actions={
          <Button icon={<Wand2 />} onClick={() => setImporting(true)}>
            Autofill from website
          </Button>
        }
      />

      {missing.length > 0 && (
        <div className="banner warn">
          <AlertTriangle />
          <span className="grow">Incomplete — agents will say they don't know about: {missing.join(', ')}.</span>
        </div>
      )}
      <SectionCard title="Profile" description={s.draft?.updated_at ? `Last updated ${new Date(s.draft.updated_at).toLocaleString()}` : undefined} section={s}>
        {(p, patch) => (
          <>
            <h4 className="perm-group" style={{ border: 0, padding: 0, margin: 0 }}>
              <span className="eyebrow">About</span>
            </h4>
            <div className="form-grid">
              <Field label="Business name">
                <Input value={p.about.name} onChange={(e) => patch({ about: { ...p.about, name: e.target.value } })} />
              </Field>
              <Field label="Industry">
                <Input value={p.about.industry} onChange={(e) => patch({ about: { ...p.about, industry: e.target.value } })} />
              </Field>
              <Field label="Website" className="full">
                <Input value={p.about.website} placeholder="https://" onChange={(e) => patch({ about: { ...p.about, website: e.target.value } })} />
              </Field>
              <Field label="What you do" className="full">
                <Textarea
                  rows={3}
                  value={p.about.description}
                  onChange={(e) =>
                    patch({
                      about: { ...p.about, description: e.target.value },
                    })
                  }
                />
              </Field>
            </div>

            <ListSection
              title="Products and services"
              rows={p.offerings}
              blank={{ name: '', description: '', price: '' }}
              onChange={(offerings) => patch({ offerings })}
              cols={[
                { key: 'name', label: 'Name' },
                { key: 'description', label: 'Description', wide: true },
                { key: 'price', label: 'Price' },
              ]}
            />

            <div>
              <span className="eyebrow">Opening hours</span>
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {DAYS.map((d) => {
                  const h = p.hours[d] ?? {
                    open: '09:00',
                    close: '18:00',
                    closed: false,
                  };
                  const set = (x) => patch({ hours: { ...p.hours, [d]: { ...h, ...x } } });
                  return (
                    <div key={d} className="row wrap" style={{ gap: 12 }}>
                      <span
                        style={{
                          width: 48,
                          fontWeight: 500,
                          textTransform: 'capitalize',
                        }}
                      >
                        {d}
                      </span>
                      <label className="check" style={{ width: 90 }}>
                        <input type="checkbox" checked={!h.closed} onChange={(e) => set({ closed: !e.target.checked })} />
                        Open
                      </label>
                      <input
                        type="time"
                        className="input"
                        style={{ width: 130 }}
                        disabled={h.closed}
                        value={h.open}
                        onChange={(e) => set({ open: e.target.value })}
                      />
                      <span className="muted">to</span>
                      <input
                        type="time"
                        className="input"
                        style={{ width: 130 }}
                        disabled={h.closed}
                        value={h.close}
                        onChange={(e) => set({ close: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <ListSection
              title="Locations"
              rows={p.locations}
              blank={{ label: '', address: '' }}
              onChange={(locations) => patch({ locations })}
              cols={[
                { key: 'label', label: 'Name' },
                { key: 'address', label: 'Address', wide: true },
              ]}
            />

            <div>
              <span className="eyebrow">Contact details</span>
              <div className="grid-3" style={{ marginTop: 10 }}>
                {['phone', 'email', 'whatsapp'].map((k) => (
                  <Field key={k} label={k === 'whatsapp' ? 'WhatsApp' : k[0].toUpperCase() + k.slice(1)}>
                    <Input
                      value={p.contact[k]}
                      onChange={(e) =>
                        patch({
                          contact: { ...p.contact, [k]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div>
              <span className="eyebrow">Policies</span>
              <div className="stack" style={{ marginTop: 10 }}>
                {['refund', 'delivery', 'cancellation'].map((k) => (
                  <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} policy`}>
                    <Textarea
                      rows={2}
                      value={p.policies[k]}
                      onChange={(e) =>
                        patch({
                          policies: { ...p.policies, [k]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>

            <ListSection
              title="Common questions"
              rows={p.faqs}
              blank={{ question: '', answer: '' }}
              onChange={(faqs) => patch({ faqs })}
              cols={[
                { key: 'question', label: 'Question', wide: true },
                { key: 'answer', label: 'Answer', wide: true },
              ]}
            />
          </>
        )}
      </SectionCard>
      <ImportModal
        open={importing}
        onClose={() => setImporting(false)}
        onApply={(found) => {
          if (!s.draft) return;
          s.setDraft({
            ...s.draft,
            ...found,
            about: { ...s.draft.about, ...(found.about ?? {}) },
            contact: { ...s.draft.contact, ...(found.contact ?? {}) },
            policies: { ...s.draft.policies, ...(found.policies ?? {}) },
          });
        }}
      />
    </>
  );
}

function ListSection({ title, rows, blank, onChange, cols }) {
  return (
    <div>
      <div className="row between">
        <span className="eyebrow">{title}</span>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...rows, { ...blank }])}>
          Add
        </Button>
      </div>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        {!rows.length && <span className="muted small">None yet.</span>}
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            {cols.map((c) => (
              <input
                key={c.key}
                className="input"
                style={{ flex: c.wide ? 2 : 1, minWidth: 0 }}
                placeholder={c.label}
                value={r[c.key] ?? ''}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))}
              />
            ))}
            <button
              type="button"
              className="icon-btn"
              style={{ width: 44, height: 44, flexShrink: 0 }}
              aria-label="Remove"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** AGT-08.3: suggested content is reviewed before it touches the form. */
function ImportModal({ open, onClose, onApply }) {
  const [importFromWebsite] = useImportCompanyFromWebsiteMutation();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [found, setFound] = useState(null);

  return (
    <Modal
      open={open}
      onClose={() => {
        setFound(null);
        onClose();
      }}
      wide
      title="Autofill from your website"
      description="We read your site and suggest content. Nothing is saved until you apply it and press Save."
      footer={
        found ? (
          <>
            <Button onClick={() => setFound(null)}>Back</Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(found);
                setFound(null);
                onClose();
              }}
            >
              Apply suggestions
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={<Globe />}
              loading={busy}
              onClick={async () => {
                if (!/^https?:\/\/.+\..+/.test(url.trim())) return setError('Enter a full URL, e.g. https://example.com');
                setBusy(true);
                setError(null);
                try {
                  setFound(await importFromWebsite(url.trim()).unwrap());
                } catch (e) {
                  setError(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Read website
            </Button>
          </>
        )
      }
    >
      {found ? (
        <pre className="code" style={{ maxHeight: 420, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(found, null, 2)}
        </pre>
      ) : (
        <div className="stack">
          {error && <div className="alert-inline">{error}</div>}
          <Field label="Website URL">
            <Input autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

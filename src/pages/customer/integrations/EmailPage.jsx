import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Pencil, Send, Unplug } from 'lucide-react';
import { useConnectEmailMutation, useDisconnectEmailMutation, useGetEmailChannelQuery, useTestEmailMutation } from '../../../store/api/integrationApi';
import { dateTime } from '../../../lib/format';
import { Async, Button, ConfirmDialog, Field, formErrors, Input, PageHeader, Skeleton, StatusBadge, useToast } from '../../../components/ui';
import { Select } from '../../../components/forms';

const SECURITY = [
  { value: 'starttls', label: 'STARTTLS' },
  { value: 'tls', label: 'SSL/TLS' },
  { value: 'none', label: 'None (not encrypted – only for servers inside your own network)' },
];
const SECURITY_LABEL = { starttls: 'STARTTLS', tls: 'SSL/TLS', none: 'None (not encrypted)' };

// Common Indian business mailboxes. "Other" leaves the server details to fill in.
const PRESETS = [
  {
    key: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    note: "Gmail needs 2-step verification on the account and an app password (Google Account → Security → App passwords). The normal password won't work.",
  },
  {
    key: 'microsoft',
    label: 'Microsoft 365 / Outlook',
    host: 'smtp.office365.com',
    port: 587,
    security: 'starttls',
    note: 'SMTP sign-in (Authenticated SMTP) must be allowed for this mailbox in the Microsoft 365 admin center. If the account uses multi-factor sign-in, use an app password.',
  },
  {
    key: 'zoho',
    label: 'Zoho Mail India',
    host: 'smtp.zoho.in',
    port: 465,
    security: 'tls',
    note: 'Use the Zoho Mail address and its password, or an app-specific password if two-factor authentication is on.',
  },
  { key: 'other', label: 'Other', host: '', port: '', security: 'starttls', note: "Your email provider's help pages list the SMTP server, port and security to use." },
];

const FIELDS = ['host', 'port', 'security', 'username', 'password', 'from_email', 'from_name'];

/** Email channel: the company's own mailbox sends call follow-ups (phase 5). */
export function EmailChannelPage() {
  const email = useGetEmailChannelQuery();
  const [disconnectEmail] = useDisconnectEmailMutation();
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  return (
    <>
      <Link to="/integrations" className="back-link">
        <ArrowLeft /> Integrations
      </Link>
      <PageHeader
        eyebrow="Connect"
        title="Email"
        description="Call follow-ups by email are sent from this mailbox, through your own mail server (SMTP), so replies come back to you. Aurlynn doesn't send email itself."
      />
      <Async state={email} skeleton={<Skeleton h={260} />}>
        {(c) =>
          !c.connected ? (
            <EmailForm key="new" />
          ) : editing ? (
            <EmailForm key="edit" current={c} onDone={() => setEditing(false)} />
          ) : (
            <div className="stack">
              <MailboxCard c={c} onEdit={() => setEditing(true)} onDisconnect={() => setDisconnecting(true)} />
              <TestEmailCard from={c.from_email} />
            </div>
          )
        }
      </Async>
      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        danger
        title="Disconnect email?"
        description="Email follow-ups stop. The stored password is deleted; you can connect again at any time."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          await disconnectEmail().unwrap();
          setEditing(false);
        }}
      />
    </>
  );
}

function MailboxCard({ c, onEdit, onDisconnect }) {
  const ok = c.status === 'connected';
  return (
    <div className="card card-pad stack">
      <div className="row between wrap">
        <div className="row" style={{ gap: 16, minWidth: 0 }}>
          <span className="clay" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}>
            <Mail />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="card-title" style={{ overflowWrap: 'anywhere' }}>
                {c.from_email}
              </span>
              <StatusBadge status={ok ? 'active' : 'failed'} label={ok ? 'Connected' : 'Error'} />
            </div>
            <div className="muted small">{c.from_name ? `Emails come from “${c.from_name}”` : 'Emails come from this address'}</div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={<Pencil />} onClick={onEdit}>
            Edit
          </Button>
          <Button variant="danger" icon={<Unplug />} onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
      {c.last_error && (
        <div className="banner danger" style={{ margin: 0 }}>
          <span className="grow">
            <b>The last email didn't go out:</b> {c.last_error}
          </span>
        </div>
      )}
      <dl className="kv">
        <dt>Mail server</dt>
        <dd className="mono">
          {c.host}:{c.port}
        </dd>
        <dt>Security</dt>
        <dd>{SECURITY_LABEL[c.security] ?? c.security}</dd>
        <dt>Login</dt>
        <dd className="mono">{c.username}</dd>
        <dt>Login checked</dt>
        <dd>{dateTime(c.verified_at)}</dd>
      </dl>
    </div>
  );
}

/** Connect form; with `current` it edits the connection (an empty password keeps the stored one). */
function EmailForm({ current, onDone }) {
  const toast = useToast();
  const [connectEmail] = useConnectEmailMutation();
  const [preset, setPreset] = useState(() => (current ? (PRESETS.find((p) => p.host && p.host === current.host)?.key ?? 'other') : null));
  const [f, setF] = useState(() =>
    current
      ? {
          host: current.host,
          port: String(current.port ?? ''),
          security: current.security,
          username: current.username,
          password: '',
          from_email: current.from_email,
          from_name: current.from_name ?? '',
        }
      : { host: '', port: '', security: 'starttls', username: '', password: '', from_email: '', from_name: '' },
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };
  const choose = (p) => {
    setPreset(p.key);
    setF({ ...f, host: p.host, port: String(p.port), security: p.security });
    setErrors({});
    setError(null);
  };
  const note = PRESETS.find((p) => p.key === preset)?.note;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await connectEmail({
        host: f.host.trim(),
        port: Number(f.port) || 0,
        security: f.security,
        username: f.username.trim(),
        password: f.password,
        from_email: f.from_email.trim(),
        from_name: f.from_name.trim(),
      }).unwrap();
      toast(current ? 'Email settings saved' : 'Email connected');
      onDone?.();
    } catch (err) {
      const r = formErrors(err, FIELDS);
      setErrors(r.fields);
      setError(r.general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad stack" onSubmit={submit} noValidate>
      <div>
        <div className="card-title">{current ? 'Change the mailbox settings' : 'Connect your mailbox'}</div>
        <div className="card-sub">The login is checked with your mail server before it is saved. The password is stored encrypted.</div>
      </div>
      <div className="field">
        <span className="field-label">Where is your mailbox?</span>
        <div className="row wrap" style={{ gap: 8 }} role="group" aria-label="Mail provider">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className={`chip ${preset === p.key ? 'active' : ''}`} aria-pressed={preset === p.key} onClick={() => choose(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {note && (
        <div className="banner info" style={{ margin: 0 }}>
          <span className="grow">{note}</span>
        </div>
      )}
      <div className="form-grid">
        <Field label="Mail server (SMTP)" error={errors.host}>
          <Input className="mono" placeholder="smtp.yourcompany.in" value={f.host} invalid={!!errors.host} onChange={set('host')} autoComplete="off" />
        </Field>
        <Field label="Port" error={errors.port}>
          <Input type="number" min={1} max={65535} placeholder="587" value={f.port} invalid={!!errors.port} onChange={set('port')} />
        </Field>
        <Field label="Security" error={errors.security} className="full">
          <Select value={f.security} options={SECURITY} onChange={set('security')} />
        </Field>
        <Field label="Username" hint="Usually the full email address." error={errors.username}>
          <Input value={f.username} invalid={!!errors.username} onChange={set('username')} autoComplete="off" />
        </Field>
        <Field
          label="Password"
          hint={current ? 'Leave empty to keep the current password.' : 'For Gmail and Outlook, an app password.'}
          error={errors.password}
        >
          <Input type="password" value={f.password} invalid={!!errors.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="From email" hint="The address follow-ups come from." error={errors.from_email}>
          <Input type="email" placeholder="care@yourclinic.in" value={f.from_email} invalid={!!errors.from_email} onChange={set('from_email')} />
        </Field>
        <Field label="From name" hint="Shown as the sender, e.g. your business name." error={errors.from_name}>
          <Input value={f.from_name} invalid={!!errors.from_name} onChange={set('from_name')} />
        </Field>
      </div>
      {error && <div className="alert-inline">{error}</div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" type="submit" loading={busy}>
          {busy ? 'Checking the login with your mail server…' : current ? 'Save' : 'Connect'}
        </Button>
        {current && (
          <Button onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function TestEmailCard({ from }) {
  const toast = useToast();
  const [testEmail, { isLoading }] = useTestEmailMutation();
  const [to, setTo] = useState('');
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  return (
    <form
      className="card card-pad stack"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const addr = to.trim();
        if (!addr) return;
        setError(null);
        setSentTo(null);
        try {
          await testEmail(addr).unwrap();
          setSentTo(addr);
          toast('Test email sent');
        } catch (err) {
          const r = formErrors(err, ['to']);
          setError(r.fields.to ?? r.general);
        }
      }}
    >
      <div>
        <div className="card-title">Send a test email</div>
        <div className="card-sub">Checks that emails go out from {from}.</div>
      </div>
      <Field label="Send the test to" error={error}>
        <Input
          type="email"
          placeholder="you@yourcompany.in"
          value={to}
          invalid={!!error}
          onChange={(e) => {
            setTo(e.target.value);
            setError(null);
          }}
          style={{ maxWidth: 360 }}
        />
      </Field>
      <div>
        <Button type="submit" icon={<Send />} loading={isLoading} disabled={!to.trim()}>
          Send test email
        </Button>
      </div>
      {sentTo && <div className="muted small">Sent to {sentTo}. Check that inbox, and its spam folder.</div>}
    </form>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Eye, EyeOff, MailCheck } from 'lucide-react';
import {
  useAcceptInviteMutation,
  useForgotPasswordMutation,
  useGetInviteInfoQuery,
  useResetPasswordMutation,
  useSignupMutation,
  useVerifyEmailMutation,
} from '../../store/api/authApi';
import { useListAgentsQuery, useGetCompanyProfileQuery } from '../../store/api/flowApi';
import { useListCallsQuery, useListNumbersQuery } from '../../store/api/callsApi';
import { useAuth } from '../../lib/auth';
import { Button, errMsg, Field, Input, PageHeader, Skeleton } from '../../components/ui';
import { AuthLayout, BrandAuthLayout } from './LoginPage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strong = (p) => p.length >= 8 && /\d/.test(p) && /[A-Za-z]/.test(p);
const RULES = 'At least 8 characters, with a letter and a number.';

/** P-02 Accept invite / set password (CUS-02.1). */
export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const info = useGetInviteInfoQuery(token);
  const [acceptInvite] = useAcceptInviteMutation();
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!strong(pw)) return setError(RULES);
    setBusy(true);
    setError(null);
    try {
      // On success the mutation stores the returned tokens in Redux.
      const t = await acceptInvite({ token, name: name.trim(), password: pw }).unwrap();
      if (t?.access_token) navigate('/welcome', { replace: true });
      else
        navigate('/login', {
          replace: true,
          state: { notice: 'Password set — sign in to continue.' },
        });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const expired = info.error && [404, 410].includes(info.error.status) && !info.error.notAvailable;

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="eyebrow">You're invited</div>
        <h1>{info.data ? `Join ${info.data.company}` : 'Set up your account'}</h1>
        {info.isLoading ? (
          <Skeleton h={18} w={260} style={{ marginTop: 12 }} />
        ) : info.data ? (
          <p className="lead">
            {info.data.inviter} invited <b>{info.data.email}</b> to Aurlynn.
          </p>
        ) : expired ? (
          <p className="lead">This link has expired or was already used. Ask your admin to resend the invite.</p>
        ) : null}
        {!expired && (
          <div className="stack" style={{ marginTop: 28 }}>
            {error && <div className="alert-inline">{error}</div>}
            <Field label="Your name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Choose a password" hint={RULES}>
              <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              Join <ArrowRight />
            </Button>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}

/** P-03 Forgot password (CUS-02.2). Same message whether or not the email exists. */
export function ForgotPasswordPage() {
  const [forgotPassword] = useForgotPasswordMutation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  return (
    <BrandAuthLayout title="Forgot your" soft="password?" lead="It happens. We'll email you a secure link to choose a new one.">
      <form
        className="login-card"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!EMAIL_RE.test(email)) return setError('Enter a valid email');
          setBusy(true);
          setError(null);
          try {
            const r = await forgotPassword(email.trim()).unwrap();
            setSent({ link: r?.reset_link });
          } catch (err) {
            setError(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{sent ? 'Check your email' : 'Reset your password'}</h2>
        <p className="muted">{sent ? 'Follow the link in the email to choose a new password.' : "Enter your work email and we'll send you a link."}</p>
        {sent ? (
          <div className="stack" style={{ marginTop: 28 }}>
            <div className="banner info" style={{ margin: 0 }}>
              <MailCheck />
              <span className="grow">If an account exists for {email}, a reset link is on its way. Check your inbox.</span>
            </div>
            {sent.link && (
              <p className="small muted">
                Email isn't connected yet, so here's the link:{' '}
                <Link to={new URL(sent.link, window.location.origin).pathname} className="login-link">
                  open reset page
                </Link>
              </p>
            )}
            <Link to="/login" className="btn primary lg block" style={{ marginTop: 6 }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="stack" style={{ marginTop: 28 }}>
              {error && (
                <div className="alert-inline" role="alert">
                  {error}
                </div>
              )}
              <div className="field">
                <label htmlFor="forgot-email">Work email</label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" size="lg" block loading={busy} style={{ marginTop: 6 }}>
                Send reset link <ArrowRight />
              </Button>
            </div>
            <div className="login-divider">
              <span>or</span>
            </div>
            <p className="small muted" style={{ textAlign: 'center' }}>
              Remembered it?{' '}
              <Link to="/login" className="login-link">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </form>
    </BrandAuthLayout>
  );
}

/** P-03 Reset password (CUS-02.3). */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const [resetPassword] = useResetPasswordMutation();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <BrandAuthLayout title="Almost" soft="there." lead="Choose a new password, then sign in to pick up where you left off.">
      <form
        className="login-card"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!strong(pw)) return setError(RULES);
          if (pw !== pw2) return setError("Passwords don't match");
          setBusy(true);
          setError(null);
          try {
            await resetPassword({ token, password: pw }).unwrap();
            navigate('/login', {
              replace: true,
              state: {
                notice: 'Password updated — sign in with your new password.',
              },
            });
          } catch (err) {
            setError(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Choose a new password</h2>
        <p className="muted">You&apos;ll use it the next time you sign in.</p>
        <div className="stack" style={{ marginTop: 28 }}>
          {error && (
            <div className="alert-inline" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="reset-password">New password</label>
            <div className="input-wrap">
              <Input
                id="reset-password"
                type={show ? 'text' : 'password'}
                autoFocus
                autoComplete="new-password"
                placeholder="••••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button type="button" className="input-icon" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <span className="hint">{RULES}</span>
          </div>
          <div className="field">
            <label htmlFor="reset-password-2">Confirm password</label>
            <Input
              id="reset-password-2"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={busy} style={{ marginTop: 6 }}>
            Update password <ArrowRight />
          </Button>
        </div>
        <div className="login-divider">
          <span>or</span>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          <Link to="/login" className="login-link">
            Back to sign in
          </Link>
        </p>
      </form>
    </BrandAuthLayout>
  );
}

/** P-04 Sign up (CUS-09.1). */
export function SignupPage() {
  const [signup] = useSignupMutation();
  const [f, setF] = useState({
    name: '',
    email: '',
    company: '',
    password: '',
  });
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  return (
    <BrandAuthLayout title="Start" soft="building." lead="Create, deploy and scale voice agents for India — with natural, multilingual conversations.">
      <form
        className="login-card"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.name.trim() || !f.company.trim()) return setError('Enter your name and company');
          if (!EMAIL_RE.test(f.email)) return setError('Enter a valid work email');
          if (!strong(f.password)) return setError(RULES);
          if (!terms) return setError('Please accept the terms');
          setBusy(true);
          setError(null);
          try {
            const r = await signup({
              ...f,
              name: f.name.trim(),
              company: f.company.trim(),
              email: f.email.trim(),
            }).unwrap();
            setDone({ link: r?.verify_link });
          } catch (err) {
            setError(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{done ? 'Check your email' : 'Create your AURLYNN account'}</h2>
        <p className="muted">{done ? 'One more step to start your trial.' : 'Start free — no card required.'}</p>
        {done ? (
          <div className="stack" style={{ marginTop: 28 }}>
            <div className="banner info" style={{ margin: 0 }}>
              <MailCheck />
              <span className="grow">We sent a verification link to {f.email}. Open it to start your trial.</span>
            </div>
            {done.link && (
              <p className="small muted">
                Email isn't connected yet:{' '}
                <Link to={new URL(done.link, window.location.origin).pathname} className="login-link">
                  verify now
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 28 }}>
            {error && (
              <div className="alert-inline" role="alert">
                {error}
              </div>
            )}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="signup-name">Your name</label>
                <Input id="signup-name" autoFocus autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="signup-company">Company</label>
                <Input id="signup-company" autoComplete="organization" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="signup-email">Work email</label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <div className="input-wrap">
                <Input
                  id="signup-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                />
                <button type="button" className="input-icon" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <span className="hint">{RULES}</span>
            </div>
            <label className="check small">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>I agree to the Terms of Service and Privacy Policy.</span>
            </label>
            <Button type="submit" variant="primary" size="lg" block loading={busy} style={{ marginTop: 6 }}>
              Create account <ArrowRight />
            </Button>
          </div>
        )}

        <div className="login-divider">
          <span>or</span>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" className="login-link">
            Sign in
          </Link>
        </p>
      </form>
    </BrandAuthLayout>
  );
}

/** CUS-09.2 email verification. */
export function VerifyEmailPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [verifyEmail] = useVerifyEmailMutation();
  const [state, setState] = useState('checking');
  const [error, setError] = useState('');
  const sent = useRef(false);
  useEffect(() => {
    // One-time token: send it once even under StrictMode's double effects.
    if (sent.current) return;
    sent.current = true;
    verifyEmail(token)
      .unwrap()
      .then((t) => {
        // The mutation stores returned tokens in Redux.
        if (t?.access_token && t.refresh_token) navigate('/welcome', { replace: true });
        else setState('ok');
      })
      .catch((e) => {
        setError(errMsg(e));
        setState('error');
      });
  }, [token, verifyEmail, navigate]);
  return (
    <AuthLayout>
      <div className="auth-form">
        <div className="eyebrow">Email verification</div>
        <h1>{state === 'checking' ? 'Verifying…' : state === 'ok' ? 'Email verified' : "We couldn't verify that link"}</h1>
        <p className="lead">{state === 'ok' ? 'Your trial has started. Sign in to set up your first agent.' : state === 'error' ? error : ''}</p>
        {state !== 'checking' && (
          <Link to="/login" className="btn primary lg block" style={{ marginTop: 24 }}>
            Sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}

/** P-05 Onboarding checklist (CUS-09.4): five steps to a first live call. */
export function WelcomePage() {
  const { profile } = useAuth();
  const prof = useGetCompanyProfileQuery();
  const ag = useListAgentsQuery({ limit: 50 });
  const nums = useListNumbersQuery();
  const cl = useListCallsQuery({ limit: 1, range: '90d' });
  const agentList = ag.data?.items ?? [];
  const p = {
    profile: !!prof.data?.about?.description,
    agent: agentList.length > 0,
    tested: agentList.some((a) => a.published_version),
    number: !!nums.data?.some((n) => n.agent_id),
    call: (cl.data?.total ?? 0) > 0,
    firstAgent: agentList[0]?.id,
  };
  const steps = [
    {
      done: p?.profile,
      title: 'Fill in your company profile',
      text: 'Business facts every agent answers from.',
      to: '/company',
    },
    {
      done: p?.agent,
      title: 'Create your first agent',
      text: 'Start from a template — it takes a minute.',
      to: '/build',
    },
    {
      done: p?.tested,
      title: 'Test it and publish',
      text: 'Chat with the draft, then make it live.',
      to: p?.firstAgent ? `/agents/${p.firstAgent}` : '/agents',
    },
    {
      done: p?.number,
      title: 'Attach a phone number',
      text: 'Pick which number your agent answers.',
      to: '/numbers',
    },
    {
      done: p?.call,
      title: 'Make a real call',
      text: 'Call your number, or have the agent call you.',
      to: '/calls',
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title={`Welcome${profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}`}
        description="Five steps to your first live call."
        actions={
          <Link to="/" className="btn ghost">
            Skip for now
          </Link>
        }
      />
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row between">
          <b>
            {done} of {steps.length} done
          </b>
          <span className="muted small">{Math.round((done / steps.length) * 100)}%</span>
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <span style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {steps.map((s, i) => (
          <Link key={i} to={s.to} className="card card-pad row between" style={{ padding: '18px 22px' }}>
            <div className="row" style={{ gap: 14 }}>
              {s.done ? <CheckCircle2 color="var(--green)" /> : <Circle color="var(--border-strong)" />}
              <div>
                <div
                  className="cell-main"
                  style={{
                    textDecoration: s.done ? 'line-through' : undefined,
                    color: s.done ? 'var(--muted)' : undefined,
                  }}
                >
                  {i + 1}. {s.title}
                </div>
                <div className="cell-sub">{s.text}</div>
              </div>
            </div>
            <span className="arrow-btn">
              <ArrowRight />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

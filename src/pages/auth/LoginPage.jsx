import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { loginErrorMessage, useAuth } from '../../lib/auth';
import { Button, Field, Input } from '../../components/ui';
import { HeroArt, LogoMark } from '../../components/Logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="row" style={{ gap: 12 }}>
          <LogoMark size={34} />
          <span className="brand-word" style={{ fontSize: 13 }}>
            AURLYNN
          </span>
        </div>
        {children}
        <div className="muted small">© {new Date().getFullYear()} Aurlynn · Voice agents for India</div>
      </div>
      <div className="auth-art" aria-hidden>
        <HeroArt />
        <div className="quote">
          <div className="eyebrow">Voice AI platform</div>
          <div
            style={{
              marginTop: 10,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
            }}
          >
            Turn conversations into <span style={{ color: '#8d8c89' }}>real outcomes.</span>
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>
            Create, deploy and scale voice agents with natural, multilingual conversations.
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { realm, status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isAdmin = realm === 'admin';
  const home = isAdmin ? '/admin' : '/';
  const from = location.state?.from;
  const notice = location.state?.notice;

  if (status === 'signed-in') return <Navigate to={from ?? home} replace />;

  const emailErr = touched && !EMAIL_RE.test(email) ? 'Enter a valid email address' : null;
  const pwErr = touched && !password ? 'Enter your password' : null;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_RE.test(email) || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from ?? home, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="realm-switch" role="tablist" aria-label="Account type">
          <Link to="/login" className={!isAdmin ? 'active' : ''}>
            Customer
          </Link>
          <Link to="/admin/login" className={isAdmin ? 'active' : ''}>
            Platform admin
          </Link>
        </div>
        <div className="eyebrow" style={{ marginTop: 32 }}>
          {isAdmin ? 'Aurlynn console' : 'Welcome back'}
        </div>
        <h1>{isAdmin ? 'Sign in to the console' : 'Sign in to Aurlynn'}</h1>
        <p className="lead">{isAdmin ? 'Manage customers, plans, staff and roles.' : "Build, deploy and monitor your company's voice agents."}</p>

        <div className="stack" style={{ marginTop: 32 }}>
          {notice && !error && (
            <div className="banner info" style={{ margin: 0 }}>
              {notice}
            </div>
          )}
          {error && (
            <div className="alert-inline" role="alert">
              {error}
            </div>
          )}
          <Field label="Work email" error={emailErr}>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              invalid={!!emailErr}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" error={pwErr}>
            <div className="input-wrap">
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                invalid={!!pwErr}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="input-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </Field>
          {!isAdmin && (
            <div style={{ textAlign: 'right', marginTop: -6 }}>
              <Link to="/forgot-password" className="small" style={{ fontWeight: 500 }}>
                Forgot password?
              </Link>
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Sign in <ArrowRight />
          </Button>
          {!isAdmin && (
            <p className="small muted" style={{ textAlign: 'center' }}>
              New to Aurlynn? <Link to="/signup">Create an account</Link>
            </p>
          )}
          <div className="row muted small" style={{ justifyContent: 'center', gap: 6 }}>
            <ShieldCheck size={14} /> Sessions refresh automatically and end when you sign out.
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { loginErrorMessage, useAuth } from '../../lib/auth';
import { Button, Input } from '../../components/ui';
import { ThemeToggle } from '../../components/Shell';
import { useTheme } from '../../lib/theme';
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

/** Two-column brand frame shared by sign-in and sign-up; `children` is the card. */
export function BrandAuthLayout({ title, soft, lead, children }) {
  const { theme } = useTheme();
  return (
    <div className="login">
      <img className="login-art" src={theme === 'dark' ? '/dark.png' : '/hero.png'} alt="" aria-hidden="true" draggable="false" />
      <section className="login-intro">
        <div className="login-brand">
          <LogoMark size={40} />
          <span className="brand-word">AURLYNN</span>
        </div>
        <div className="login-copy">
          <h1>
            {title} <span className="soft">{soft}</span>
          </h1>
          <p className="lead">{lead}</p>
        </div>
        <div className="muted small login-foot">© {new Date().getFullYear()} Aurlynn · Voice agents for India</div>
      </section>

      <section className="login-panel">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        {children}
      </section>
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

  // One page for both sessions: /login signs in a customer, /admin/login the
  // platform console. Self-serve links only exist for customers.
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
    <BrandAuthLayout title="Welcome" soft="back." lead="Sign in to continue building and managing your voice agents.">
      <form className="login-card" onSubmit={submit} noValidate>
        <h2>Sign in to AURLYNN</h2>
        <p className="muted">Use your work email and password.</p>

        <div className="stack" style={{ marginTop: 28 }}>
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
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              invalid={!!emailErr}
              aria-invalid={!!emailErr}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailErr && <span className="error-text">{emailErr}</span>}
          </div>
          <div className="field">
            <div className="row between">
              <label htmlFor="login-password" className="field-label">
                Password
              </label>
              {!isAdmin && (
                <Link to="/forgot-password" className="small login-link">
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="input-wrap">
              <Input
                id="login-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                invalid={!!pwErr}
                aria-invalid={!!pwErr}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="input-icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {pwErr && <span className="error-text">{pwErr}</span>}
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={busy} style={{ marginTop: 6 }}>
            Sign in <ArrowRight />
          </Button>
        </div>

        {!isAdmin && (
          <>
            <div className="login-divider">
              <span>or</span>
            </div>
            <p className="small muted" style={{ textAlign: 'center' }}>
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="login-link">
                Create account
              </Link>
            </p>
          </>
        )}
      </form>
    </BrandAuthLayout>
  );
}

import { Component } from 'react';
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react';
import { Button } from './ui';

/*
 * Catches a crash while drawing a page, so the person sees what went wrong
 * and a way out instead of a blank white screen. AppShell wraps its pages in
 * one (resetKey is the URL: going to another page clears the error, and the
 * sidebar stays usable throughout); main.jsx wraps the whole app in another
 * as a last resort.
 */

// After a deploy, an open tab can ask for a page file that no longer exists.
const staleBuild = (e) => /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(e?.message ?? e));

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, details: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, details: false });
  }

  componentDidCatch(error, info) {
    console.error('Page crashed', error, info?.componentStack);
  }

  render() {
    const { error, details } = this.state;
    if (!error) return this.props.children;

    const stale = staleBuild(error);
    const full = this.props.full;
    return (
      <div className="state error" role="alert" style={full ? { minHeight: '100vh', justifyContent: 'center' } : undefined}>
        <div className="state-icon">
          <AlertTriangle />
        </div>
        <h3>{stale ? 'A newer version is available' : 'Something went wrong on this page'}</h3>
        <p style={{ maxWidth: 520 }}>
          {stale
            ? 'The app was updated while this tab was open. Reload to get the latest version.'
            : 'The page hit an error while showing this. Your data is safe. Try reloading; if it keeps happening, send the details below to support.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          <Button variant="primary" size="sm" icon={<RotateCw />} onClick={() => window.location.reload()}>
            Reload
          </Button>
          {!full && window.history.length > 1 && (
            <Button size="sm" icon={<ArrowLeft />} onClick={() => window.history.back()}>
              Go back
            </Button>
          )}
          {!stale && (
            <Button variant="ghost" size="sm" onClick={() => this.setState({ details: !details })}>
              {details ? 'Hide details' : 'Show details'}
            </Button>
          )}
        </div>
        {details && (
          <pre
            className="mono"
            style={{ marginTop: 12, maxWidth: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'left', fontSize: 12, opacity: 0.8 }}
          >
            {String(error?.message ?? error)}
          </pre>
        )}
      </div>
    );
  }
}

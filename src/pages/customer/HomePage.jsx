import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AudioLines, ChevronDown, Sparkles } from 'lucide-react';
import { errMsg, useToast } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useLazyListAgentsQuery } from '../../store/api/flowApi';
import { HomeDashboard } from './HomeDashboard';
import { CATEGORIES, USE_CASES } from './useCases';

const INITIAL_VISIBLE = 6;

export function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loadLiveAgents] = useLazyListAgentsQuery();
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => (category === 'All' ? USE_CASES : USE_CASES.filter((u) => u.categories.includes(category))), [category]);
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  const submit = (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    navigate(`/agents/new?prompt=${encodeURIComponent(text)}`);
  };

  return (
    <>
      <img className="hero-image" src={theme === 'dark' ? '/dark.png' : '/hero.png'} alt="" aria-hidden="true" draggable="false" />
      <section className="hero">
        <div className="eyebrow">
          Welcome to <b>Aurlynn</b>
        </div>
        <h1>
          Turn conversations
          <br />
          into <span className="soft">real outcomes.</span>
        </h1>
        <p className="lead">Create, deploy and scale voice agents for India — with natural, multilingual conversations.</p>

        <form className="prompt-box" onSubmit={submit} role="search">
          <Sparkles aria-hidden />
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what your voice agent should do..."
            aria-label="Describe your voice agent"
          />
          <button type="submit" className="round-ink" aria-label="Create agent" disabled={!prompt.trim()}>
            <ArrowRight />
          </button>
        </form>
      </section>

      <div className="chips" role="tablist" aria-label="Use case categories" style={{ position: 'relative', zIndex: 1 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            className={`chip ${category === c ? 'active' : ''}`}
            onClick={() => {
              setCategory(c);
              setExpanded(false);
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="usecase-grid" style={{ position: 'relative', zIndex: 1 }}>
        {visible.map((u) => (
          <button key={u.key} className="usecase" onClick={() => navigate(`/agents/new?template=${u.key}`)}>
            <span className={`clay ${u.warm ? 'warm' : ''}`}>
              <u.icon />
            </span>
            <span>
              <h3>{u.title}</h3>
              <p>{u.description}</p>
            </span>
            <span className="arrow-btn" aria-hidden>
              <ArrowRight />
            </span>
          </button>
        ))}
      </div>

      {filtered.length > INITIAL_VISIBLE && (
        <button className={`view-more ${expanded ? 'open' : ''}`} onClick={() => setExpanded((e) => !e)}>
          <ChevronDown />
          {expanded ? 'Show fewer use cases' : 'View more use cases'}
        </button>
      )}

      <HomeDashboard />

      <button
        className="fab"
        onClick={async () => {
          try {
            const list = await loadLiveAgents({ status: 'live', limit: 1 }).unwrap();
            const first = list.items[0];
            if (first) navigate(`/agents/${first.id}?test=voice`);
            else navigate('/agents/new');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      >
        <AudioLines />
        <span>Talk to AURLYNN</span>
      </button>
    </>
  );
}

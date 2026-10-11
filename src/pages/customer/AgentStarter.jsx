import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import { CATEGORIES, USE_CASES } from './useCases';

const INITIAL_VISIBLE = 6;

/** "Describe your agent" box shared by Home and Agents; opens the new-agent flow with the prompt. */
export function AgentPromptBox({ placeholder = 'Describe what your voice agent should do...' }) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    navigate(`/agents/new?prompt=${encodeURIComponent(text)}`);
  };

  return (
    <form className="prompt-box" onSubmit={submit} role="search">
      <Sparkles aria-hidden />
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={placeholder} aria-label="Describe your voice agent" />
      <button type="submit" className="round-ink" aria-label="Create agent" disabled={!prompt.trim()}>
        <ArrowRight />
      </button>
    </form>
  );
}

/** Category chips + use-case template cards (AGT-11) shared by Home and Agents. */
export function UseCaseGallery({ centered = false }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => (category === 'All' ? USE_CASES : USE_CASES.filter((u) => u.categories.includes(category))), [category]);
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <div className={`chips ${centered ? 'centered' : ''}`} role="tablist" aria-label="Use case categories" style={{ position: 'relative', zIndex: 1 }}>
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
    </>
  );
}

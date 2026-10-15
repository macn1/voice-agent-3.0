import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import { CATEGORIES, USE_CASES } from './useCases';

const INITIAL_VISIBLE = 6;

const PROMPT_IDEAS = [
  'Build an AI voice agent to qualify sales leads and book demos',
  'Create a support agent to answer customer questions 24/7',
  'Build an outbound agent to follow up with potential customers',
  'Create an appointment booking agent with automated reminders',
  'Build an inbound agent to handle calls and route them to the right team',
  'Create a voice agent to collect customer feedback and satisfaction scores',
  'Build a payment reminder agent for overdue invoices',
  'Create a receptionist agent to answer calls and capture caller details',
  'Build a lead qualification agent that updates my CRM after each call',
  'Create a voice agent to schedule callbacks and follow up with missed calls',
  'Build a multilingual voice agent to support customers in different languages',
  'Create an AI agent to manage reservations and answer booking questions',
];

const TYPE_MS = 38;
const ERASE_MS = 18;
const HOLD_MS = 1800;

/** Types each phrase out, holds, erases it, then moves on. Returns the text to show as the placeholder. */
function useTypedPlaceholder(phrases, paused) {
  const [text, setText] = useState('');

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (paused || reduced) return undefined;

    let i = 0;
    let n = 0;
    let erasing = false;
    let timer;
    const tick = () => {
      const phrase = phrases[i];
      if (!erasing) {
        n += 1;
        setText(phrase.slice(0, n));
        if (n === phrase.length) {
          erasing = true;
          timer = setTimeout(tick, HOLD_MS);
          return;
        }
        timer = setTimeout(tick, TYPE_MS);
      } else {
        n -= 1;
        setText(phrase.slice(0, n));
        if (n === 0) {
          erasing = false;
          i = (i + 1) % phrases.length;
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, ERASE_MS);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [phrases, paused]);

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduced || paused ? phrases[0] : text;
}

/** "Describe your agent" box shared by Home and Agents; opens the new-agent flow with the prompt.
 *  Pass `placeholder` for a fixed hint, otherwise it cycles through example ideas. */
export function AgentPromptBox({ placeholder, ideas = PROMPT_IDEAS }) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const typed = useTypedPlaceholder(ideas, Boolean(placeholder) || focused || Boolean(prompt));
  const hint = placeholder ?? `${typed || ' '}`;

  const submit = (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    navigate(`/agents/new?prompt=${encodeURIComponent(text)}`);
  };

  return (
    <form className="prompt-box" onSubmit={submit} role="search">
      <Sparkles aria-hidden />
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={hint}
        aria-label="Describe your voice agent"
      />
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

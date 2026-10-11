import { useNavigate } from 'react-router-dom';
import { AudioLines } from 'lucide-react';
import { errMsg, useToast } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useLazyListAgentsQuery } from '../../store/api/flowApi';
import { AgentPromptBox, UseCaseGallery } from './AgentStarter';
import { HomeDashboard } from './HomeDashboard';

export function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loadLiveAgents] = useLazyListAgentsQuery();
  const { theme } = useTheme();

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

        <AgentPromptBox />
      </section>

      <UseCaseGallery />

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

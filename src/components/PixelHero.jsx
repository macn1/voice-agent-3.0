import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';

/**
 * "Clay" icon tile in the home page style, with an optional motion:
 * ring (phone ringing), fly (sends off and returns), pulse, nudge.
 */
export function ClayIcon({ icon: Icon, children, warm, motion, size }) {
  return (
    <span className={`clay ${warm ? 'warm' : ''} ${size ?? ''}`}>
      <span className={`clay-glyph ${motion ? `motion-${motion}` : ''}`}>{Icon ? <Icon /> : children}</span>
    </span>
  );
}

/** Full-page empty hero: floating clay icon, headline, and API / create-agent actions. */
export function PixelHero({ icon, motion, warm, compact, title, description, actions, apiTo = '/developers', createTo = '/agents/new' }) {
  return (
    <div className={`pixel-hero ${compact ? 'compact' : ''}`}>
      <div className="hero-icon">
        <span className="hero-ripple" aria-hidden />
        <span className="hero-ripple late" aria-hidden />
        <ClayIcon icon={icon} motion={motion} warm={warm} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="pixel-hero-actions">
        {actions ?? (
          <>
            <Link to={apiTo} className="btn">
              Build with API <ArrowRight />
            </Link>
            <Link to={createTo} className="btn primary">
              <Plus /> Create agent
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

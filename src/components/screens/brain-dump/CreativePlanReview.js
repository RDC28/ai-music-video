import { Film, MapPin, Users } from 'lucide-react';

export default function CreativePlanReview({ plan, onEditIdea }) {
  if (!plan) return null;

  const scenes = Array.isArray(plan.script?.scenes) ? plan.script.scenes : [];
  const characters = Array.isArray(plan.characters) ? plan.characters : [];
  const locations = Array.isArray(plan.locations) ? plan.locations : [];

  return (
    <section className="brain-review">
      <div className="brain-review__header">
        <div>
          <div className="panel-meta-label">Creative Plan</div>
          <h3>{plan.script?.title || 'Untitled music video'}</h3>
        </div>
        {onEditIdea && (
          <button type="button" className="btn-outline-small" onClick={onEditIdea}>
            Edit idea
          </button>
        )}
      </div>

      {plan.script?.storyline && (
        <p className="brain-review__story">{plan.script.storyline}</p>
      )}

      <div className="brain-review__stats">
        <span><Film size={12} /> {scenes.length} scenes</span>
        <span><Users size={12} /> {characters.length} characters</span>
        <span><MapPin size={12} /> {locations.length} locations</span>
      </div>

      {scenes.length > 0 && (
        <div className="brain-review__scene-list">
          {scenes.slice(0, 4).map((scene, index) => (
            <div key={`${scene.visual || scene.description || index}`} className="brain-review__scene">
              <span>Scene {String(index + 1).padStart(2, '0')}</span>
              <p>{scene.visual || scene.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

import { Brain, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getKBSummary } from '@/utils/knowledgeBase';

function formatAge(summary) {
  if (!summary.usable) return 'Not built';
  if (summary.age_hours < 1) return 'Fresh just now';
  if (summary.age_hours < 24) return `Fresh ${summary.age_hours}h ago`;
  return `${Math.round(summary.age_hours / 24)}d old`;
}

export default function BrainStatusPanel({
  projectId,
  projectState,
  onDataUpdate,
  onRefineBrain,
  isRefining,
}) {
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState('');
  const summary = getKBSummary(projectState?.knowledge_base);
  const moodWords = summary.mood_keywords?.length
    ? summary.mood_keywords
    : projectState?.script?.mood_keywords || [];
  const styleCue = projectState?.knowledge_base?.style?.global_lock
    || projectState?.style_bible?.visual_tone
    || projectState?.style_bible?.global_notes
    || '';
  const documentedCount = (summary.characters || 0) + (summary.locations || 0);

  const handleForceBuild = async () => {
    if (!projectId || isBuilding) return;
    setIsBuilding(true);
    setError('');
    try {
      const response = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectState, force: true }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Brain rebuild failed.');
      await onDataUpdate({ knowledge_base: data.knowledge_base });
    } catch (err) {
      setError(err.message || 'Brain rebuild failed.');
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <aside className="brain-status-panel">
      <section className="brain-status-card">
        <div className="brain-status-panel__title">
          <div className="brain-status-mark">
            {isBuilding || isRefining ? <Loader2 size={18} className="spin" /> : <Brain size={18} />}
          </div>
          <div>
            <div className="panel-meta-label">Brain Status</div>
            <h3>{summary.usable ? 'Context is ready' : 'Context is waiting'}</h3>
          </div>
        </div>

        <div className="brain-readiness">
          <strong>{documentedCount}</strong>
          <span>documented assets</span>
        </div>

        <div className="brain-status-list">
          <div>
            <span>Status</span>
            <strong>{isBuilding ? 'Building' : formatAge(summary)}</strong>
          </div>
          <div>
            <span>Cast</span>
            <strong>{summary.characters || 0}</strong>
          </div>
          <div>
            <span>Places</span>
            <strong>{summary.locations || 0}</strong>
          </div>
          <div>
            <span>Style</span>
            <strong>{summary.has_style ? 'Locked' : 'Open'}</strong>
          </div>
        </div>

        {moodWords.length > 0 && (
          <div className="brain-chip-row">
            {moodWords.slice(0, 5).map(word => (
              <span key={word} className="brain-chip brain-chip--selected">{word}</span>
            ))}
          </div>
        )}

        {styleCue && (
          <p className="brain-status-panel__cue">{String(styleCue).slice(0, 180)}</p>
        )}

        {error && (
          <div className="queue-msg queue-msg--error brain-error">
            <span>Alert:</span>
            {error}
          </div>
        )}

        <div className="brain-status-actions">
          <button type="button" className="btn-action-generate" onClick={onRefineBrain} disabled={isRefining}>
            {isRefining ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {isRefining ? 'Refining...' : 'Refine Brain'}
          </button>
          <button type="button" className="btn-outline" onClick={handleForceBuild} disabled={isBuilding || !projectId}>
            {isBuilding ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Rebuild
          </button>
        </div>
      </section>

      <section className="brain-status-panel__rule">
        <CheckCircle2 size={13} color="var(--cyan)" />
        <p>Generation now reads from the locked project brain.</p>
      </section>
    </aside>
  );
}

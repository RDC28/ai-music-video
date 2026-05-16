import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Mic2, PenLine, Sparkles, Loader2, Users, MapPin, Film } from 'lucide-react';
import ProgressBar from '../ProgressBar';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId, projectState }) {
  const [idea, setIdea]                   = useState('');
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [progressStep, setProgressStep]   = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [isEditingIdea, setIsEditingIdea] = useState(false);

  const SCRIPT_STEPS = [
    'Reading your idea',
    'Finding lyric and mood cues',
    'Writing scenes',
    'Drafting cast and locations',
    'Building the shot plan',
    'Saving creative plan',
  ];

  const savedPlan = useMemo(() => {
    if (projectState?.script && projectState?.characters && projectState?.locations) {
      return {
        script: projectState.script,
        characters: projectState.characters,
        locations: projectState.locations,
        shot_list: projectState.shot_list,
      };
    }
    return null;
  }, [projectState]);

  const reviewPlan = generatedPlan || (!isEditingIdea ? savedPlan : null);
  const transcript = projectState?.analysis?.lyrics;

  const handleBrainDump = async (customPrompt = null) => {
    const finalPrompt = customPrompt || idea;
    if (!finalPrompt.trim()) return alert('Please enter an idea first');
    setIsAnalyzing(true);
    setProgressStep(0);
    try {
      setProgressStep(1);
      setTimeout(() => setProgressStep(2), 600);
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: finalPrompt, transcript }),
      });
      const plan = await response.json();
      if (plan.error) throw new Error(plan.error);
      setProgressStep(3);
      setGeneratedPlan(plan);
      setIsEditingIdea(false);
      setProgressStep(4);
      await onDataUpdate({ script: plan.script, characters: plan.characters, locations: plan.locations, shot_list: plan.shot_list, current_step: 4 });
      setProgressStep(5);
    } catch (error) {
      console.error('Creative plan failed:', error);
      alert('We could not create the plan. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setProgressStep(-1);
    }
  };

  const handleUseTranscript = () => {
    if (!transcript) {
      if (confirm('No lyrics found yet. Analyze the song first?')) onNavigate(2);
      return;
    }
    handleBrainDump(`Based on these lyrics: "${transcript.map(l => l.text).join(' ')}". ${idea}`);
  };

  /* ── Review mode ── */
  if (reviewPlan) {
    const scenes     = reviewPlan.script?.scenes || [];
    const characters = reviewPlan.characters || [];
    const locations  = reviewPlan.locations || [];

    return (
      <div className="screen active" id="s3">
        <div className="screen-header-modern">
          <div>
            <div className="screen-kicker">Creative plan · ready</div>
            <h1 className="screen-title">The story has shape.</h1>
            <p className="screen-subtitle">
              Review the scenes, cast, and locations before moving into visual references.
            </p>
          </div>
          <div className="screen-actions">
            <button
              className="btn-outline"
              onClick={() => { setGeneratedPlan(null); setIsEditingIdea(true); }}
            >
              <PenLine size={13} />
              Edit idea
            </button>
            <button className="btn-orange" onClick={() => onNavigate(4)}>
              Continue to Cast
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Asymmetric 58/42 */}
        <div className="grid-58-42">
          {/* Script panel — scrollable */}
          <section className="panel-raised">
            <div>
              <div className="panel-meta-label">▪ Master Script</div>
              <div className="script-title">
                {reviewPlan.script?.title || 'Untitled music video'}
              </div>
              <div className="script-mood">
                Mood · {reviewPlan.script?.mood || 'Not specified'}
              </div>
            </div>

            {/* Full script as scrollable text */}
            <div className="panel-inset">
              {reviewPlan.script?.storyline && (
                <p className="script-storyline">
                  {reviewPlan.script.storyline}
                </p>
              )}
              {scenes.map((scene, i) => (
                <div key={i} style={{ marginBottom: '20px' }}>
                  <div className="scene-number">
                    Scene {String(i + 1).padStart(2, '0')}
                  </div>
                  <p style={{ marginBottom: scene.lyrics ? '8px' : 0 }}>
                    {scene.visual}
                  </p>
                  {scene.lyrics && (
                    <p className="scene-lyrics">
                      &ldquo;{scene.lyrics}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Sidebar — starts 40px lower for asymmetry */}
          <aside className="sidebar-offset">
            {/* Cast */}
            <div className="panel-flat">
              <div className="panel-section-header">
                <Users size={12} color="var(--cyan)" />
                <span className="panel-meta-label">
                  Cast · {String(characters.length).padStart(2, '0')}
                </span>
              </div>
              <div className="item-row-list">
                {characters.map((char, i) => (
                  <div key={i} className="item-row">
                    {char.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div className="panel-flat">
              <div className="panel-section-header">
                <MapPin size={12} color="var(--cyan)" />
                <span className="panel-meta-label">
                  Locations · {String(locations.length).padStart(2, '0')}
                </span>
              </div>
              <div className="item-row-list">
                {locations.map((loc, i) => (
                  <div key={i} className="item-row">
                    {loc.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Shot count */}
            <div className="panel-flat" style={{ marginTop: 'auto' }}>
              <div className="panel-section-header">
                <Film size={12} color="var(--cyan)" />
                <span className="panel-meta-label">Shot List</span>
              </div>
              <div className="metric-large">
                {reviewPlan.shot_list?.length || 0}
              </div>
              <p className="body-sm body-sm--mt">
                Review and edit these in the Shot List step.
              </p>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  /* ── Input mode ── */
  return (
    <div className="screen active" id="s3">
      <div className="screen-header-modern">
        <div>
          <div className="screen-kicker">Concept · Studio</div>
          <h1 className="screen-title">Describe your vision.</h1>
          <p className="screen-subtitle">
            Share the story, emotion, imagery, or references you want the song to carry.
          </p>
        </div>
        <div className="screen-actions">
          <button className="btn-outline" onClick={() => onNavigate(4)} disabled={isAnalyzing}>
            Skip to Cast →
          </button>
        </div>
      </div>

      {/* Asymmetric 60/40 */}
      <div className="grid-60-40">
        {/* Concept panel */}
        <section className="panel-raised">
          <div>
            <div className="panel-meta-label">▪ Your Concept</div>
            <p className="body-sm">
              Describe the mood, story, or visual style you&apos;re imagining. One paragraph is plenty.
            </p>
          </div>

          <textarea
            className="textarea-concept"
            placeholder="e.g. A lonely night-drive performance that becomes a neon city chase, with reflections, rain, and a final dawn rooftop scene."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={isAnalyzing}
          />

          <div className="btn-row">
            <button
              className="btn-orange"
              onClick={() => handleBrainDump()}
              disabled={isAnalyzing || !idea.trim()}
            >
              {isAnalyzing
                ? <Loader2 size={14} className="spin" />
                : <Sparkles size={14} />}
              {isAnalyzing ? 'Generating…' : 'Generate creative plan'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={handleUseTranscript}
              disabled={isAnalyzing}
            >
              <Mic2 size={13} />
              {transcript ? 'Use lyrics' : 'Add song insights first?'}
            </button>
          </div>

          {isAnalyzing && <ProgressBar steps={SCRIPT_STEPS} currentStep={progressStep} />}
        </section>

        {/* Sidebar — offset lower */}
        <aside className="sidebar-offset">
          {/* Skip options */}
          <div className="panel-flat-lg">
            <div className="icon-box">
              <FileText size={16} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: '700', color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: '6px' }}>
              Skip the prompt
            </div>
            <p className="body-sm" style={{ marginBottom: '16px' }}>
              Already have structure? Move directly into characters or the shot list.
            </p>
            <div className="flex-col gap-8">
              <button className="btn-outline" onClick={() => onNavigate(4)} style={{ width: '100%' }}>
                Cast →
              </button>
              <button className="btn-outline" onClick={() => onNavigate(7)} style={{ width: '100%' }}>
                Shot Plan →
              </button>
            </div>
          </div>

          {/* Lyrics info */}
          <div className="panel-flat-lg" style={{ marginTop: 'auto' }}>
            <div className="panel-meta-label" style={{ color: transcript ? 'var(--cyan)' : undefined, marginBottom: '10px' }}>
              ▪ Lyrics & Timing
            </div>
            <div className={transcript ? 'metric-large' : 'metric-large metric-large--muted'}>
              {transcript?.length || 0}
              <span className="metric-small-label">lines</span>
            </div>
            <p className="body-sm" style={{ marginTop: '10px' }}>
              Song timing gives the story stronger beat and lyric awareness.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

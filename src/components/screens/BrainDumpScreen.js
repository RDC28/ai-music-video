import { useEffect, useMemo, useState } from 'react';
import { Mic2, PenLine, Sparkles, Loader2, Users, MapPin, Film } from 'lucide-react';
import ProgressBar from '../ProgressBar';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId, projectState }) {
  const [idea, setIdea]                   = useState('');
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [progressStep, setProgressStep]   = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [isEditingIdea, setIsEditingIdea] = useState(false);
  const [brainDumpError, setBrainDumpError] = useState('');
  const [analysisStartedAt, setAnalysisStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - (analysisStartedAt || Date.now())) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [analysisStartedAt, isAnalyzing]);

  const handleBrainDump = async (customPrompt = null) => {
    const finalPrompt = customPrompt || idea;
    if (!finalPrompt.trim()) {
      setBrainDumpError('Please enter an idea first.');
      return;
    }
    setBrainDumpError('');
    setAnalysisStartedAt(Date.now());
    setElapsedSeconds(0);
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
      setBrainDumpError('We could not create the plan. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setProgressStep(-1);
      setAnalysisStartedAt(null);
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
      <div className="screen active screen-fill" id="s3">
        <WorkflowThreePaneShell
          showLeftPanel={false}
          sidebarTitle="Story"
          rightTitle="Actions"
          storageKey="workflow-three-pane:s3:review"
          sidebar={null}
          main={(
            <div className="flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
              <div className="screen-header-modern">
                <div>
                  <div className="screen-kicker">Creative plan · ready</div>
                  <h1 className="screen-title">The story has shape.</h1>
                  <p className="screen-subtitle">
                    Review the scenes, cast, and locations before moving into visual references.
                  </p>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, padding: '0 1.5rem 1.5rem' }}>
                <section className="panel-raised" style={{ height: '100%', minHeight: 0 }}>
                  <div>
                    <div className="panel-meta-label">▪ Master Script</div>
                    <div className="script-title">
                      {reviewPlan.script?.title || 'Untitled music video'}
                    </div>
                    <div className="script-mood">
                      Mood · {reviewPlan.script?.mood || 'Not specified'}
                    </div>
                  </div>

                  <div className="panel-inset">
                    {reviewPlan.script?.storyline && (
                      <p className="script-storyline">
                        {reviewPlan.script.storyline}
                      </p>
                    )}
                    {scenes.map((scene, i) => (
                      <div key={i} style={{ marginBottom: '1.25rem' }}>
                        <div className="scene-number">
                          Scene {String(i + 1).padStart(2, '0')}
                        </div>
                        <p style={{ marginBottom: scene.lyrics ? '0.5rem' : 0 }}>
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
              </div>
            </div>
          )}
          right={(
            <aside className="flex-col gap-10" style={{ height: '100%', padding: '1rem' }}>
              <div className="panel-flat">
                <div className="panel-meta-label">▪ Actions</div>
                <div className="flex-col gap-8">
                  <button
                    className="btn-outline"
                    onClick={() => { setGeneratedPlan(null); setIsEditingIdea(true); }}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <PenLine size={13} />
                    Edit idea
                  </button>
                </div>
              </div>

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

              <div className="panel-flat" style={{ marginTop: 'auto' }}>
                <div className="panel-section-header">
                  <Film size={12} color="var(--cyan)" />
                  <span className="panel-meta-label">Shot List</span>
                </div>
                <div className="metric-large">
                  {reviewPlan.shot_list?.length || 0}
                </div>
                <p className="body-sm body-sm--mt">
                  Review and edit these in the Shot List step. Use the left step bar to continue.
                </p>
              </div>
            </aside>
          )}
        />
      </div>
    );
  }

  /* ── Input mode ── */
  return (
    <div className="screen active screen-fill" id="s3">
      <WorkflowThreePaneShell
        showLeftPanel={false}
        sidebarTitle="Concept"
        rightTitle="Actions"
        storageKey="workflow-three-pane:s3:input"
        sidebar={null}
        main={(
          <div className="flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="screen-header-modern">
              <div>
                <div className="screen-kicker">Concept · Studio</div>
                <h1 className="screen-title">Describe your vision.</h1>
                <p className="screen-subtitle">
                  Share the story, emotion, imagery, or references you want the song to carry.
                </p>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: '0 1.5rem 1.5rem' }}>
              <section className="panel-raised" style={{ height: '100%', minHeight: 0 }}>
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

                {isAnalyzing && (
                  <>
                    <ProgressBar steps={SCRIPT_STEPS} currentStep={progressStep} />
                    <div className="field-note" style={{ marginTop: '0.5rem' }}>
                      Generating · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} · typically 3–6 min
                    </div>
                  </>
                )}

                {brainDumpError && !isAnalyzing && (
                  <div className="queue-msg queue-msg--error" style={{ marginTop: '0.75rem' }}>
                    <span>Alert:</span>
                    {brainDumpError}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
        right={(
          <aside className="flex-col gap-10" style={{ height: '100%', padding: '1rem' }}>
            <div className="panel-flat-lg">
              <div className="panel-meta-label">▪ Actions</div>
              <div className="flex-col gap-8">
                <button
                  className="btn-orange"
                  onClick={() => handleBrainDump()}
                  disabled={isAnalyzing || !idea.trim()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {isAnalyzing
                    ? <Loader2 size={14} className="spin" />
                    : <Sparkles size={14} />}
                  {isAnalyzing ? 'Generating…' : 'Generate creative plan'}
                </button>
                {brainDumpError && !isAnalyzing && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => handleBrainDump()}
                    disabled={!idea.trim()}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Try Again
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleUseTranscript}
                  disabled={isAnalyzing}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Mic2 size={13} />
                  {transcript ? 'Use lyrics' : 'Add song insights first?'}
                </button>
              </div>
            </div>

            <div className="panel-flat-lg" style={{ marginTop: 'auto' }}>
              <div className="panel-meta-label" style={{ color: transcript ? 'var(--cyan)' : undefined, marginBottom: '0.625rem' }}>
                ▪ Lyrics & Timing
              </div>
              <div className={transcript ? 'metric-large' : 'metric-large metric-large--muted'}>
                {transcript?.length || 0}
                <span className="metric-small-label">lines</span>
              </div>
              <p className="body-sm" style={{ marginTop: '0.625rem' }}>
                Song timing gives the story stronger beat and lyric awareness.
              </p>
              <p className="body-sm" style={{ marginTop: '0.625rem' }}>
                Use the left step bar to jump to Cast or Shot Plan when ready.
              </p>
            </div>
          </aside>
        )}
      />
    </div>
  );
}

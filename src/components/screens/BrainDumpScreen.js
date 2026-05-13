import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Mic2, PenLine, Sparkles } from 'lucide-react';
import ProgressBar from '../ProgressBar';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId, projectState }) {
  const [idea, setIdea] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [isEditingIdea, setIsEditingIdea] = useState(false);

  const SCRIPT_STEPS = [
    'Reading your idea',
    'Finding lyric and mood cues',
    'Writing scenes',
    'Drafting cast and locations',
    'Building the shot plan',
    'Saving creative plan'
  ];

  const savedPlan = useMemo(() => {
    if (projectState?.script && projectState?.characters && projectState?.locations) {
      return {
        script: projectState.script,
        characters: projectState.characters,
        locations: projectState.locations,
        shot_list: projectState.shot_list
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
        body: JSON.stringify({ idea: finalPrompt, transcript })
      });

      const plan = await response.json();
      if (plan.error) throw new Error(plan.error);

      setProgressStep(3);
      setGeneratedPlan(plan);
      setIsEditingIdea(false);

      setProgressStep(4);
      await onDataUpdate({
        script: plan.script,
        characters: plan.characters,
        locations: plan.locations,
        shot_list: plan.shot_list,
        current_step: 4
      });
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
      const confirmGen = confirm('No lyrics or timing found yet. Would you like to analyze the song first?');
      if (confirmGen) onNavigate(2);
      return;
    }
    const transcriptText = transcript.map(l => l.text).join(' ');
    handleBrainDump(`Based on these lyrics: "${transcriptText}". ${idea}`);
  };

  /* ── Generated Plan View ── */
  if (reviewPlan) {
    const scenes = reviewPlan.script?.scenes || [];
    const lyricsTimeline = reviewPlan.script?.lyrics_timeline || [];
    const characters = reviewPlan.characters || [];
    const locations = reviewPlan.locations || [];

    return (
      <div className="screen active" id="s3">
        <div className="screen-header-modern">
          <div>
            <div className="screen-kicker">Creative plan · ready</div>
            <h1 className="screen-title">The story has shape.</h1>
            <p className="screen-subtitle">
              Review the story, cast, locations, and shot count before moving into visual references.
            </p>
          </div>
          <div className="screen-actions">
            <button
              className="btn-outline"
              onClick={() => {
                setGeneratedPlan(null);
                setIsEditingIdea(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <PenLine size={14} />
              Edit Idea
            </button>
            <button
              className="btn-orange"
              onClick={() => onNavigate(4)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              Continue to Cast
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="brain-review-layout">
          <section className="premium-panel brain-panel-scroll" style={{ padding: '26px' }}>
            <div className="panel-label" style={{ marginBottom: '14px' }}>
              ── Master Script
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: '32px',
                fontWeight: 500,
                color: 'var(--dark)',
                marginBottom: '6px',
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
              }}
            >
              {reviewPlan.script?.title || 'Untitled music video'}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Mood · {reviewPlan.script?.mood || 'Not specified'}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: lyricsTimeline.length > 0 ? 'minmax(0, 1.1fr) minmax(280px, 0.9fr)' : '1fr',
                gap: '18px',
                minHeight: 0,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                {scenes.map((scene, i) => (
                  <div
                    key={i}
                    className="subtle-panel"
                    style={{
                      padding: '16px 18px',
                      borderLeft: '2px solid rgba(124,58,237,0.5)',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--teal)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '8px',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Scene {String(i + 1).padStart(2, '0')} · {scene.start}s — {scene.end}s
                    </div>
                    <div
                      style={{
                        color: 'var(--dark)',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        marginBottom: scene.lyrics ? '10px' : 0,
                        fontFamily: 'var(--font-body)',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {scene.visual}
                    </div>
                    {scene.lyrics && (
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-soft)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontWeight: 400,
                          lineHeight: 1.55,
                          letterSpacing: '-0.01em',
                          paddingLeft: '14px',
                          borderLeft: '1px solid rgba(124,58,237,0.22)',
                        }}
                      >
                        “{scene.lyrics}”
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {lyricsTimeline.length > 0 && (
                <div className="subtle-panel brain-panel-scroll" style={{ padding: '16px', maxHeight: '100%' }}>
                  <div className="panel-label" style={{ color: 'var(--orange)', marginBottom: '14px' }}>
                    ── Lyrics Timeline
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {lyricsTimeline.map((line, i) => (
                      <div key={i} style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {(line.words || []).map((w, j) => (
                            <div
                              key={j}
                              style={{
                                background: 'rgba(124,58,237,0.04)',
                                padding: '5px 9px',
                                borderRadius: '8px',
                                border: '1px solid rgba(124,58,237,0.12)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{
                                  color: 'var(--dark)',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-body)',
                                  letterSpacing: '-0.005em',
                                }}
                              >
                                {w.word}
                              </span>
                              <span
                                style={{
                                  color: 'var(--text-muted)',
                                  fontSize: '8.5px',
                                  fontFamily: 'var(--font-mono)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {w.start}s
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="brain-side-panel premium-panel">
            <div className="subtle-panel" style={{ padding: '18px' }}>
              <div className="panel-label" style={{ color: 'var(--orange)', marginBottom: '14px' }}>
                ── Cast · {String(characters.length).padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {characters.map((char, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '7px 13px',
                      background: 'rgba(124,58,237,0.06)',
                      borderRadius: '999px',
                      border: '1px solid rgba(124,58,237,0.18)',
                      fontSize: '13px',
                      color: 'var(--dark)',
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontWeight: 500,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {char.name}
                  </div>
                ))}
              </div>
            </div>

            <div className="subtle-panel" style={{ padding: '18px' }}>
              <div className="panel-label" style={{ marginBottom: '14px' }}>
                ── Locations · {String(locations.length).padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {locations.map((loc, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '7px 13px',
                      background: 'rgba(124,58,237,0.06)',
                      borderRadius: '999px',
                      border: '1px solid rgba(124,58,237,0.18)',
                      fontSize: '13px',
                      color: 'var(--dark)',
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontWeight: 500,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {loc.name}
                  </div>
                ))}
              </div>
            </div>

            <div className="subtle-panel" style={{ padding: '20px', marginTop: 'auto' }}>
              <div className="panel-label" style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>
                ── Shot List
              </div>
              <div
                style={{
                  fontSize: '40px',
                  color: 'var(--dark)',
                  fontWeight: 500,
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {reviewPlan.shot_list?.length || 0}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Shots Generated
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '10px', lineHeight: 1.6 }}>
                You can review and edit these in the Shot List step.
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  /* ── Input View ── */
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

      <div className="brain-input-layout">
        <section className="brain-concept-panel premium-panel">
          <div className="panel-label">── Your Concept</div>
          <p
            style={{
              fontSize: '13.5px',
              color: 'var(--text-soft)',
              lineHeight: 1.65,
              margin: '10px 0 18px',
              maxWidth: '560px',
            }}
          >
            Describe the mood, story, or visual style you&apos;re imagining for this music video.
            One paragraph is plenty.
          </p>
          <textarea
            className="brain-textarea"
            placeholder="e.g. A lonely night-drive performance that becomes a neon city chase, with reflections, rain, and a final dawn rooftop scene."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={isAnalyzing}
          />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
            <button
              className="btn-orange"
              onClick={() => handleBrainDump()}
              disabled={isAnalyzing || !idea.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Sparkles size={15} />
              {isAnalyzing ? 'Generating…' : 'Generate creative plan'}
            </button>
            {transcript ? (
              <button
                type="button"
                className="btn-outline"
                onClick={handleUseTranscript}
                disabled={isAnalyzing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Mic2 size={15} />
                Use Lyrics
              </button>
            ) : (
              <button
                type="button"
                className="btn-outline"
                onClick={handleUseTranscript}
                style={{ opacity: 0.7 }}
              >
                Add song insights first?
              </button>
            )}
          </div>

          {isAnalyzing && <ProgressBar steps={SCRIPT_STEPS} currentStep={progressStep} />}
        </section>

        <aside className="brain-side-panel premium-panel">
          <div className="subtle-panel" style={{ padding: '20px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(124,58,237,0.14), rgba(124,58,237,0.04))',
                border: '1px solid rgba(124,58,237,0.24)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--teal)',
                marginBottom: '14px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <FileText size={18} />
            </div>
            <div className="landing-card-title">Skip the prompt</div>
            <p className="landing-card-copy">
              Already have structure? Move directly into characters or the production shot list.
            </p>
            <div style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
              <button className="btn-outline" onClick={() => onNavigate(4)} style={{ width: '100%' }}>
                Cast →
              </button>
              <button className="btn-outline" onClick={() => onNavigate(7)} style={{ width: '100%' }}>
                Shot Plan →
              </button>
            </div>
          </div>

          <div className="subtle-panel" style={{ padding: '20px', marginTop: 'auto' }}>
            <div className="panel-label" style={{ color: transcript ? 'var(--teal)' : 'var(--text-muted)' }}>
              ── Lyrics &amp; Timing
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--dark)',
                fontWeight: 500,
                fontSize: '32px',
                marginTop: '10px',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                background: transcript
                  ? 'linear-gradient(135deg, var(--orange), var(--teal))'
                  : 'none',
                WebkitBackgroundClip: transcript ? 'text' : 'border-box',
                backgroundClip: transcript ? 'text' : 'border-box',
                WebkitTextFillColor: transcript ? 'transparent' : 'currentcolor',
              }}
            >
              {transcript?.length || 0}
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontStyle: 'normal',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  WebkitTextFillColor: 'var(--text-muted)',
                  marginLeft: '10px',
                }}
              >
                lines
              </span>
            </div>
            <p style={{ color: 'var(--text-soft)', fontSize: '12.5px', lineHeight: 1.6, marginTop: '12px' }}>
              Song timing gives the story stronger beat and lyric awareness.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

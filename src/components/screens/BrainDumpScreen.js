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
    const scenes         = reviewPlan.script?.scenes || [];
    const lyricsTimeline = reviewPlan.script?.lyrics_timeline || [];
    const characters     = reviewPlan.characters || [];
    const locations      = reviewPlan.locations || [];

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
        <div style={{
          display: 'grid',
          gridTemplateColumns: '58fr 42fr',
          gap: '20px',
          padding: '0 24px 24px',
          flex: 1,
          minHeight: 0,
        }}>
          {/* Script panel — scrollable */}
          <section style={{
            background: 'var(--surface-2)',
            boxShadow: 'var(--neo-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '26px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}>
                ▪ Master Script
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '28px',
                fontWeight: '700',
                color: 'var(--text)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                marginBottom: '6px',
              }}>
                {reviewPlan.script?.title || 'Untitled music video'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                Mood · {reviewPlan.script?.mood || 'Not specified'}
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: lyricsTimeline.length > 0 ? '1fr 280px' : '1fr',
              gap: '16px',
              alignItems: 'start',
            }}>
              {/* Scenes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {scenes.map((scene, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-deep)',
                    boxShadow: 'var(--neo-inset)',
                    border: '1px solid var(--border)',
                    borderLeft: '2px solid var(--cyan-border)',
                    borderRadius: 'var(--radius)',
                    padding: '14px 16px',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      fontWeight: '700',
                      color: 'var(--cyan)',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                    }}>
                      Scene {String(i + 1).padStart(2, '0')} · {scene.start}s — {scene.end}s
                    </div>
                    <p style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text)',
                      lineHeight: 1.6,
                      marginBottom: scene.lyrics ? '10px' : 0,
                    }}>
                      {scene.visual}
                    </p>
                    {scene.lyrics && (
                      <p style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.55,
                        paddingLeft: '12px',
                        borderLeft: '1px solid var(--border-mid)',
                        fontStyle: 'italic',
                      }}>
                        &ldquo;{scene.lyrics}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Lyrics timeline */}
              {lyricsTimeline.length > 0 && (
                <div style={{
                  background: 'var(--bg-deep)',
                  boxShadow: 'var(--neo-inset)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px',
                  maxHeight: '420px',
                  overflowY: 'auto',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: '700',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                  }}>
                    ▪ Lyrics Timeline
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {lyricsTimeline.map((line, i) => (
                      <div key={i} style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {(line.words || []).map((w, j) => (
                            <div key={j} style={{
                              background: 'var(--surface)',
                              boxShadow: 'var(--neo-flat)',
                              border: '1px solid var(--border)',
                              padding: '4px 7px',
                              borderRadius: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '2px',
                            }}>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: '600', color: 'var(--text)' }}>
                                {w.word}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-muted)' }}>
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

          {/* Sidebar — starts 40px lower for asymmetry */}
          <aside style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            paddingTop: '40px',
          }}>
            {/* Cast */}
            <div style={{
              background: 'var(--surface-2)',
              boxShadow: 'var(--neo-flat)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Users size={12} color="var(--cyan)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: '700', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Cast · {String(characters.length).padStart(2, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {characters.map((char, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: 'var(--bg-deep)',
                    boxShadow: 'var(--neo-inset)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--text)',
                    letterSpacing: '-0.01em',
                  }}>
                    {char.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div style={{
              background: 'var(--surface-2)',
              boxShadow: 'var(--neo-flat)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <MapPin size={12} color="var(--cyan)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: '700', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Locations · {String(locations.length).padStart(2, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {locations.map((loc, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: 'var(--bg-deep)',
                    boxShadow: 'var(--neo-inset)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--text)',
                    letterSpacing: '-0.01em',
                  }}>
                    {loc.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Shot count */}
            <div style={{
              background: 'var(--surface-2)',
              boxShadow: 'var(--neo-flat)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px',
              marginTop: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Film size={12} color="var(--cyan)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: '700', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Shot List
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '44px',
                fontWeight: '700',
                color: 'var(--cyan)',
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}>
                {reviewPlan.shot_list?.length || 0}
              </div>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                lineHeight: 1.55,
                marginTop: '8px',
              }}>
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60fr 40fr',
        gap: '20px',
        padding: '0 24px 24px',
        flex: 1,
        minHeight: 0,
      }}>
        {/* Concept panel */}
        <section style={{
          background: 'var(--surface-2)',
          boxShadow: 'var(--neo-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '26px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '8px',
            }}>
              ▪ Your Concept
            </div>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.65,
            }}>
              Describe the mood, story, or visual style you&apos;re imagining. One paragraph is plenty.
            </p>
          </div>

          <textarea
            placeholder="e.g. A lonely night-drive performance that becomes a neon city chase, with reflections, rain, and a final dawn rooftop scene."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={isAnalyzing}
            style={{
              flex: 1,
              width: '100%',
              resize: 'none',
              background: 'var(--bg-deep)',
              boxShadow: 'var(--neo-inset)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--text)',
              lineHeight: 1.7,
              outline: 'none',
              transition: 'border-color 160ms ease-out',
              minHeight: '160px',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--cyan-border)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
          />

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn-orange"
              onClick={() => handleBrainDump()}
              disabled={isAnalyzing || !idea.trim()}
            >
              {isAnalyzing
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
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
        <aside style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          paddingTop: '40px',
        }}>
          {/* Skip options */}
          <div style={{
            background: 'var(--surface-2)',
            boxShadow: 'var(--neo-flat)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--surface)',
              boxShadow: 'var(--neo-raised)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan)',
              marginBottom: '12px',
            }}>
              <FileText size={16} />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: '700',
              color: 'var(--text)',
              letterSpacing: '-0.01em',
              marginBottom: '6px',
            }}>
              Skip the prompt
            </div>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              marginBottom: '16px',
            }}>
              Already have structure? Move directly into characters or the shot list.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-outline" onClick={() => onNavigate(4)} style={{ width: '100%' }}>
                Cast →
              </button>
              <button className="btn-outline" onClick={() => onNavigate(7)} style={{ width: '100%' }}>
                Shot Plan →
              </button>
            </div>
          </div>

          {/* Lyrics info */}
          <div style={{
            background: 'var(--surface-2)',
            boxShadow: 'var(--neo-flat)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            marginTop: 'auto',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: transcript ? 'var(--cyan)' : 'var(--text-muted)',
              marginBottom: '10px',
            }}>
              ▪ Lyrics & Timing
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontWeight: '700',
              color: transcript ? 'var(--cyan)' : 'var(--text-muted)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              marginBottom: '4px',
            }}>
              {transcript?.length || 0}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: '700',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginLeft: '8px',
              }}>
                lines
              </span>
            </div>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              marginTop: '10px',
            }}>
              Song timing gives the story stronger beat and lyric awareness.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

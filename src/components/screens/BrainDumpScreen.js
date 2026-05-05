import { useState, useEffect } from 'react';
import ProgressBar from '../ProgressBar';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId, projectState }) {
  const [idea, setIdea] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState(null);

  const SCRIPT_STEPS = [
    'Reading your idea',
    'Analyzing lyrics & transcript',
    'Writing script & scenes',
    'Creating characters & locations',
    'Building shot list',
    'Saving to project'
  ];

  useEffect(() => {
    if (projectState?.script && projectState?.characters && projectState?.locations) {
      setGeneratedPlan({
        script: projectState.script,
        characters: projectState.characters,
        locations: projectState.locations,
        shot_list: projectState.shot_list
      });
    }
  }, [projectState]);

  const transcript = projectState?.analysis?.lyrics;

  const handleBrainDump = async (customPrompt = null) => {
    const finalPrompt = customPrompt || idea;
    if (!finalPrompt.trim()) return alert("Please enter an idea first");

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
      console.error("AI Analysis failed:", error);
      alert("Something went wrong with the AI analysis. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setProgressStep(-1);
    }
  };

  const handleUseTranscript = () => {
    if (!transcript) {
      const confirmGen = confirm("No transcript found. Would you like to go back and analyze the audio first?");
      if (confirmGen) onNavigate(2);
      return;
    }
    const transcriptText = transcript.map(l => l.text).join(' ');
    handleBrainDump(`Based on these lyrics: "${transcriptText}". ${idea}`);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--border-mid)',
    borderRadius: '8px',
    background: 'var(--surface)',
    color: 'var(--dark)',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  /* ── Generated Plan View ── */
  if (generatedPlan) {
    return (
      <div className="screen active" id="s3">

        {/* Header */}
        <div style={{
          padding: '18px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
              Creative Plan Generated
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Review your AI-generated script, characters, and locations below
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-outline"
              onClick={() => setGeneratedPlan(null)}
              style={{ fontSize: '12px' }}
            >
              Edit Idea
            </button>
            <button
              className="btn-teal"
              onClick={() => onNavigate(4)}
              style={{ fontSize: '12px' }}
            >
              Continue to Characters →
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', padding: '24px 28px', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: Script + Lyrics Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden', minHeight: 0 }}>

            {/* Script */}
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px',
              overflowY: 'auto',
              flex: '0 0 auto',
              maxHeight: '50%',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px', fontFamily: 'var(--font-display)' }}>
                Master Script
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--dark)', marginBottom: '4px' }}>
                {generatedPlan.script.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Mood: {generatedPlan.script.mood}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {generatedPlan.script.scenes.map((scene, i) => (
                  <div key={i} style={{ borderLeft: '2px solid rgba(0,184,212,0.3)', paddingLeft: '14px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 700, fontFamily: 'var(--font-display)', marginBottom: '4px' }}>
                      {scene.start}s – {scene.end}s
                    </div>
                    <div style={{ color: 'var(--dark)', fontSize: '13px', lineHeight: 1.5, marginBottom: scene.lyrics ? '4px' : 0 }}>
                      {scene.visual}
                    </div>
                    {scene.lyrics && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        &ldquo;{scene.lyrics}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Lyrics Timeline */}
            {generatedPlan.script.lyrics_timeline?.length > 0 && (
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px',
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px', fontFamily: 'var(--font-display)' }}>
                  Word-by-Word Lyrics Timeline
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {generatedPlan.script.lyrics_timeline.map((line, i) => (
                    <div key={i} style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {line.words.map((w, j) => (
                          <div key={j} style={{
                            background: 'var(--surface)',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}>
                            <span style={{ color: 'var(--dark)', fontSize: '12px', fontWeight: 600 }}>{w.word}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{w.start}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Characters + Locations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'hidden' }}>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-display)' }}>
                Characters ({generatedPlan.characters.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {generatedPlan.characters.map((char, i) => (
                  <div key={i} style={{
                    padding: '5px 11px',
                    background: 'var(--surface)',
                    borderRadius: '5px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                  }}>
                    {char.name}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-display)' }}>
                Locations ({generatedPlan.locations.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {generatedPlan.locations.map((loc, i) => (
                  <div key={i} style={{
                    padding: '5px 11px',
                    background: 'var(--surface)',
                    borderRadius: '5px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                  }}>
                    {loc.name}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                Shot List
              </div>
              <div style={{ fontSize: '13px', color: 'var(--dark)', fontWeight: 700 }}>
                {generatedPlan.shot_list?.length || 0} shots generated
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                You can review and edit these in the Shot List step
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  /* ── Input View ── */
  return (
    <div className="screen active" id="s3">

      {/* Header */}
      <div style={{
        padding: '20px 28px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
            Describe Your Vision
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Tell us your concept — our AI will build the full creative plan from your idea
          </p>
        </div>
        <button className="btn-teal" onClick={() => onNavigate(4)} disabled={isAnalyzing} style={{ fontSize: '12px', flexShrink: 0 }}>
          Skip to Characters →
        </button>
      </div>

      <div className="brain-content">

        {/* Option 1 — AI generation */}
        <div>
          <div className="option-label">Your Concept</div>
          <div className="option-desc">
            Describe the mood, story, or visual style you&apos;re imagining for this music video.
          </div>

          <div className="text-input-row" style={{ alignItems: 'stretch', gap: '12px' }}>
            <textarea
              rows="5"
              placeholder="e.g. A neon-lit chase through a cyberpunk city, the protagonist searching for something they've lost..."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={isAnalyzing}
              style={{ fontSize: '14px', padding: '4px 0', minHeight: '100px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
              <button
                className="btn-orange"
                onClick={() => handleBrainDump()}
                disabled={isAnalyzing || !idea.trim()}
                style={{ padding: '10px 20px', fontSize: '12px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '90px' }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </span>
                <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                  {isAnalyzing ? 'Wait...' : 'Generate'}
                </span>
              </button>
            </div>
          </div>

          {/* Use transcript CTA */}
          {transcript && (
            <button
              onClick={handleUseTranscript}
              disabled={isAnalyzing}
              style={{
                marginTop: '10px',
                background: 'rgba(0, 184, 212, 0.06)',
                border: '1px solid rgba(0, 184, 212, 0.18)',
                color: 'var(--teal)',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                cursor: 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
              }}
            >
              Use Gemini Transcript as Input
            </button>
          )}

          {!transcript && (
            <div
              onClick={handleUseTranscript}
              style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', cursor: 'pointer', textDecoration: 'underline', opacity: 0.6 }}
            >
              No transcript yet — analyze audio first?
            </div>
          )}
        </div>

        {isAnalyzing && (
          <ProgressBar steps={SCRIPT_STEPS} currentStep={progressStep} />
        )}

        <div className="divider" style={{ margin: '8px 0' }} />

        {/* Manual Mode */}
        <div>
          <div className="option-label">Manual Mode</div>
          <div className="option-desc">Already have a script or want to skip AI generation?</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn-outline" onClick={() => onNavigate(4)} style={{ fontSize: '12px' }}>
              Skip to Characters
            </button>
            <button className="btn-outline" onClick={() => onNavigate(6)} style={{ fontSize: '12px' }}>
              Skip to Shot List
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

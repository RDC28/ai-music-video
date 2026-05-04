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
      // Simulate analysis phase
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
      // Save everything to the project state
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

  if (generatedPlan) {
    return (
      <div className="screen active" id="s3">
        <div className="brain-content" style={{ padding: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h2 style={{ color: 'var(--dark)', fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800 }}>
              AI CREATIVE PLAN
            </h2>
            <button 
              className="btn-teal" 
              onClick={() => onNavigate(4)}
              style={{ borderRadius: '12px', padding: '12px 32px' }}
            >
              Continue to Characters →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px' }}>
            {/* Master Content Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Script Section */}
              <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '24px', padding: '24px', overflowY: 'auto', maxHeight: '60vh' }}>
                <div style={{ color: 'var(--teal)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '16px' }}>MASTER SCRIPT</div>
                <h3 style={{ color: 'var(--dark)', fontSize: '20px', marginBottom: '8px' }}>{generatedPlan.script.title}</h3>
                <p style={{ color: '#888', fontSize: '14px', fontStyle: 'italic', marginBottom: '24px' }}>Mood: {generatedPlan.script.mood}</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {generatedPlan.script.scenes.map((scene, i) => (
                    <div key={i} style={{ borderLeft: '2px solid var(--teal)', paddingLeft: '16px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 700 }}>{scene.start}s - {scene.end}s</div>
                      <div style={{ color: 'var(--dark)', fontSize: '14px', margin: '4px 0' }}>{scene.visual}</div>
                      {scene.lyrics && <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>"{scene.lyrics}"</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Word Timeline Section */}
              <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '24px', padding: '24px', overflowY: 'auto', maxHeight: '40vh' }}>
                <div style={{ color: 'var(--orange)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '16px' }}>WORD-BY-WORD LYRICS TIMELINE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {generatedPlan.script.lyrics_timeline?.map((line, i) => (
                    <div key={i} style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {line.words.map((w, j) => (
                          <div key={j} style={{ 
                            background: '#151515', 
                            padding: '4px 8px', 
                            borderRadius: '6px', 
                            border: '1px solid #222',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                          }}>
                            <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 600 }}>{w.word}</span>
                            <span style={{ color: '#555', fontSize: '9px' }}>{w.start}s - {w.end}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Entities Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '24px', padding: '20px' }}>
                <div style={{ color: 'var(--orange)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '12px' }}>CHARACTERS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {generatedPlan.characters.map((char, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--dark)' }}>
                      {char.name}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '24px', padding: '20px' }}>
                <div style={{ color: 'var(--teal)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '12px' }}>LOCATIONS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {generatedPlan.locations.map((loc, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--dark)' }}>
                      {loc.name}
                    </div>
                  ))}
                </div>
              </div>

              <button 
                className="btn-outline" 
                onClick={() => setGeneratedPlan(null)}
                style={{ borderRadius: '12px', color: '#666' }}
              >
                ← Edit Idea
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen active" id="s3">
      <div className="brain-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
          <div>
            <div className="option-label">OPTION 1</div>
            <div className="option-desc" style={{ marginBottom: 0 }}>
              Describe your vision or brainstorm with AI
            </div>
          </div>
          {transcript && (
            <button 
              onClick={handleUseTranscript}
              disabled={isAnalyzing}
              style={{ 
                background: 'rgba(0, 184, 212, 0.1)', 
                border: '1px solid var(--teal)', 
                color: 'var(--teal)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ✨ USE GEMINI TRANSCRIPT
            </button>
          )}
        </div>

        <div className="text-input-row" style={{ alignItems: 'stretch', padding: '12px' }}>
          <textarea
            rows="5"
            placeholder="Describe your music video concept, mood, story... or just click the button to use the song's transcript!"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={isAnalyzing}
            style={{ fontSize: '15px', padding: '12px' }}
          />
          <button 
            className="btn-orange" 
            onClick={() => handleBrainDump()}
            disabled={isAnalyzing}
            style={{ 
              padding: '0 32px', 
              fontSize: '14px', 
              flexShrink: 0, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '20px' }}>{isAnalyzing ? '⌛' : '🚀'}</span>
            <span>{isAnalyzing ? 'WAIT' : 'GENERATE'}</span>
          </button>
        </div>

        {isAnalyzing && (
          <div style={{ marginTop: '16px' }}>
            <ProgressBar steps={SCRIPT_STEPS} currentStep={progressStep} />
          </div>
        )}

        {!transcript && (
          <div 
            onClick={handleUseTranscript}
            style={{ fontSize: '11px', color: '#666', marginTop: '12px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Generate transcript from audio first?
          </div>
        )}

        <div className="divider" style={{ margin: '32px 0' }} />

        <div>
          <div className="option-label">MANUAL MODE</div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button className="btn-outline" onClick={() => onNavigate(4)} style={{ borderRadius: '12px' }}>
              Upload Script
            </button>
            <button className="btn-outline" onClick={() => onNavigate(4)} style={{ borderRadius: '12px' }}>
              Skip to Characters
            </button>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', paddingTop: '40px' }}>
          <button className="btn-teal" onClick={() => onNavigate(4)} disabled={isAnalyzing} style={{ borderRadius: '12px' }}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

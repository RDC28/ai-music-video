import { useState } from 'react';
import { geminiAgent } from '@/utils/geminiAgents';
import { creditManager } from '@/utils/credits';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId }) {
  const [idea, setIdea] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleBrainDump = async () => {
    if (!idea.trim()) return alert("Please enter an idea first");
    
    setIsAnalyzing(true);
    try {
      // 1. Generate the script using Gemini
      const script = await geminiAgent.generateScript(idea);
      
      // 2. Save the script to the project state in Supabase
      await onDataUpdate({ script: script });
      
      // 3. Deduct credit (optional, but good for tracking)
      // await creditManager.deductCredits(userId, creditManager.COSTS.SCRIPT);

      // 4. Move to next screen (Characters)
      onNavigate(4);
    } catch (error) {
      console.error("AI Analysis failed:", error);
      alert("Something went wrong with the AI analysis. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="screen active" id="s3">
      <div className="brain-content">
        <div>
          <div className="option-label">OPTION 1</div>
          <div className="option-desc">
            Please tell me about your idea or would you like to brainstorm?
          </div>
          <div className="text-input-row">
            <textarea
              rows="5"
              placeholder="Describe your music video concept, mood, story..."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={isAnalyzing}
            />
            <button 
              className="btn-orange" 
              onClick={handleBrainDump}
              disabled={isAnalyzing}
              style={{ padding: '10px 24px', fontSize: '12px', flexShrink: 0 }}
            >
              {isAnalyzing ? 'ANALYZING...' : 'BRAIN DUMP'}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '12px', marginLeft: '16px', fontFamily: 'var(--font-body)' }}>
            * This prompt box will use Gemini 1.5 Pro to generate your script.
          </div>
        </div>

        <div className="divider" style={{ margin: '24px 0' }} />

        <div>
          <div className="option-label">OPTION 2</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginTop: '8px',
            }}
          >
            <button className="btn-orange" onClick={() => onNavigate(4)}>
              UPLOAD SCRIPT
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn-teal" onClick={() => onNavigate(4)} disabled={isAnalyzing}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

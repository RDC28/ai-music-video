'use client';

import { useState, useRef } from 'react';

export default function GenerateShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef(null);

  const characters = projectData?.characters || [];
  const locations = projectData?.locations || [];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Gemini API key is required for AI generation
      // For now, show a message. When the key is available, this will call the agent.
      alert("Gemini API key is required for AI shot list generation. Please use 'Upload Shot List' to manually add shots, or wait until the API key is configured.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadShotList = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Accept both array format and { shots: [...] } format
      let shotList = Array.isArray(parsed) ? parsed : (parsed.shots || parsed.shot_list || []);

      if (!Array.isArray(shotList) || shotList.length === 0) {
        alert("Invalid shot list format. Expected a JSON array of objects with 'n' (name) and 'p' (prompt) fields.");
        return;
      }

      // Normalize fields — accept n/name/title for name, p/prompt/description for prompt
      shotList = shotList.map((shot, i) => ({
        n: shot.n || shot.name || shot.title || `Shot ${i + 1}`,
        p: shot.p || shot.prompt || shot.description || '',
        duration: shot.duration || 5,
      }));

      await onDataUpdate({ shot_list: shotList, current_step: 7 });
      onNavigate(7);
    } catch (err) {
      console.error("Failed to parse shot list:", err);
      alert("Failed to parse the file. Please make sure it's a valid JSON file.");
    } finally {
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="screen active" id="s5">

      {/* Hidden file input for upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleUploadShotList} 
        accept=".json,application/json" 
        style={{ display: 'none' }} 
      />

      <div className="shot-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="shot-header" style={{ justifyContent: 'flex-end', borderBottom: 'none', paddingBottom: 0 }}>
          <div className="chars-preview">
            {characters.map((char, i) => (
              <div key={char.id || i} className="char-thumb">
                <div
                  className="char-avatar"
                  style={{
                    background: `linear-gradient(135deg, #3d8c7a, #f28c28)`,
                  }}
                />
                <div className="char-badge">{char.name}</div>
              </div>
            ))}
            {characters.length === 0 && (
              <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>No characters defined</div>
            )}

            {/* Spacer between characters and locations */}
            {(characters.length > 0 && locations.length > 0) && (
              <div style={{ width: '12px' }} />
            )}

            {locations.map((loc, i) => (
              <div key={loc.id || i} className="char-thumb">
                <div
                  className="char-avatar"
                  style={{
                    background: `linear-gradient(135deg, #2E8B57, #3CB371)`,
                  }}
                />
                <div className="char-badge" style={{ background: '#3CB371' }}>{loc.name}</div>
              </div>
            ))}
            {locations.length === 0 && (
              <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>No locations defined</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <button 
            className="btn-orange" 
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ width: '260px', padding: '16px', fontSize: '13px' }}
          >
            {isGenerating ? 'GENERATING...' : 'GENERATE SHOT LIST'}
          </button>
          
          <button 
            className="btn-teal" 
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              width: '260px', 
              padding: '16px', 
              fontSize: '13px',
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            UPLOAD SHOT LIST 
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '8px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
            Upload a JSON file with shot objects containing <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '4px' }}>n</code> (name) and <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '4px' }}>p</code> (prompt) fields.
          </div>
        </div>
      </div>
    </div>
  );
}

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

      let shotList = Array.isArray(parsed) ? parsed : (parsed.shots || parsed.shot_list || []);

      if (!Array.isArray(shotList) || shotList.length === 0) {
        alert("Invalid shot list format. Expected a JSON array of objects with 'n' (name) and 'p' (prompt) fields.");
        return;
      }

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
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="screen active" id="s5">

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadShotList}
        accept=".json,application/json"
        style={{ display: 'none' }}
      />

      {/* Page Header */}
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
            Build Your Shot List
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Generate shots with AI, or upload your own JSON shot list
          </p>
        </div>
        <button className="btn-outline" onClick={() => onNavigate(7)} style={{ fontSize: '12px', flexShrink: 0 }}>
          Skip to Shot List →
        </button>
      </div>

      {/* Context summary */}
      {(characters.length > 0 || locations.length > 0) && (
        <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
          {characters.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                Characters
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {characters.map((char, i) => (
                  <div key={i} style={{
                    padding: '3px 10px',
                    background: 'rgba(0,184,212,0.08)',
                    border: '1px solid rgba(0,184,212,0.15)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--teal)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {char.name}
                  </div>
                ))}
              </div>
            </div>
          )}
          {characters.length > 0 && locations.length > 0 && (
            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          )}
          {locations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                Locations
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {locations.map((loc, i) => (
                  <div key={i} style={{
                    padding: '3px 10px',
                    background: 'rgba(0,229,255,0.06)',
                    border: '1px solid rgba(0,229,255,0.12)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--orange)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {loc.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action cards */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', gap: '24px' }}>

        {/* Generate with AI */}
        <div style={{
          flex: 1,
          maxWidth: '340px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(0,229,255,0.08)',
            border: '1px solid rgba(0,229,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px' }}>
              Generate with AI
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Let our AI analyze your script, characters, and locations to build a full shot list automatically.
            </div>
          </div>
          <button
            className="btn-orange"
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ width: '100%', fontSize: '13px', marginTop: '4px' }}
          >
            {isGenerating ? 'Generating...' : 'Generate Shot List'}
          </button>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-display)' }}>or</div>

        {/* Upload JSON */}
        <div style={{
          flex: 1,
          maxWidth: '340px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(0,184,212,0.08)',
            border: '1px solid rgba(0,184,212,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px' }}>
              Upload Shot List
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Already have a shot list? Upload a JSON file with{' '}
              <code style={{ fontSize: '11px', background: 'var(--surface)', padding: '1px 5px', borderRadius: '3px', color: 'var(--teal)' }}>n</code>
              {' '}(name) and{' '}
              <code style={{ fontSize: '11px', background: 'var(--surface)', padding: '1px 5px', borderRadius: '3px', color: 'var(--teal)' }}>p</code>
              {' '}(prompt) fields.
            </div>
          </div>
          <button
            className="btn-teal"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', fontSize: '13px', marginTop: '4px' }}
          >
            Upload JSON File
          </button>
        </div>
      </div>
    </div>
  );
}

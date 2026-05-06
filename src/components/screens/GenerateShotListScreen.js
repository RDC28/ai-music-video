'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  FileText,
  MapPin,
  Mic2,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { countTranscriptWords, getShotTimingLabel, normalizeShotListForVeo } from '@/utils/shotList';

const panelStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '20px',
  boxShadow: 'var(--shadow-card)',
};

const labelStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
};

function parseLooseShotLines(text) {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cleaned = line.replace(/^\s*(shot\s*)?\d+[\).\-\s:]+/i, '').trim();
      const parts = cleaned.split(/\s[-:]\s/);
      const title = parts.length > 1 ? parts[0].trim() : `Shot ${index + 1}`;
      const prompt = parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleaned;
      return { n: title || `Shot ${index + 1}`, p: prompt, duration: 6 };
    });
}

export default function GenerateShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const initialShots = normalizeShotListForVeo(projectData?.shot_list || []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [previewShots, setPreviewShots] = useState(() => initialShots);
  const [previewSource, setPreviewSource] = useState(() => {
    if (!initialShots.length) return '';
    return projectData?.shot_list_meta?.approved_at ? 'approved' : 'draft';
  });
  const [coverageNotes, setCoverageNotes] = useState(() => (
    initialShots.length
      ? projectData?.shot_list_meta?.coverage_notes || 'Existing project shot list loaded for review.'
      : ''
  ));
  const [manualText, setManualText] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const characters = projectData?.characters || [];
  const locations = projectData?.locations || [];
  const transcript = projectData?.analysis?.lyrics || projectData?.script?.lyrics_timeline || [];
  const scriptScenes = projectData?.script?.scenes || [];
  const wordCount = countTranscriptWords(transcript);

  const contextItems = [
    {
      icon: FileText,
      label: 'Script',
      value: `${scriptScenes.length} scenes`,
      ready: scriptScenes.length > 0,
    },
    {
      icon: Mic2,
      label: 'Vocals',
      value: `${transcript.length} lines`,
      ready: transcript.length > 0,
    },
    {
      icon: Sparkles,
      label: 'Words',
      value: `${wordCount} timed`,
      ready: wordCount > 0,
    },
    {
      icon: Users,
      label: 'Characters',
      value: `${characters.length} cast`,
      ready: characters.length > 0,
    },
    {
      icon: MapPin,
      label: 'Locations',
      value: `${locations.length} sets`,
      ready: locations.length > 0,
    },
  ];

  const canGenerate = scriptScenes.length > 0 || transcript.length > 0;
  const missingContext = contextItems.filter(item => !item.ready).map(item => item.label);

  const loadPreviewFromText = (text, source) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = parseLooseShotLines(text);
    }

    const shots = normalizeShotListForVeo(parsed);
    if (!shots.length) {
      window.alert("Could not find shots. Upload JSON with shots/shot_list, or paste one shot per line.");
      return;
    }

    setPreviewShots(shots);
    setPreviewSource(source);
    setCoverageNotes(`${shots.length} user-supplied shots are ready for approval.`);
    setError('');
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      window.alert('Add a script or analyze the audio transcript before asking AI for a production shot list.');
      return;
    }

    setIsGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/generate-shot-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectState: projectData }),
      });

      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Shot list generation failed');

      const shots = normalizeShotListForVeo(result.shots);
      if (!shots.length) throw new Error('AI returned an empty shot list');

      setPreviewShots(shots);
      setPreviewSource('ai');
      setCoverageNotes(result.coverage_notes || 'AI shot list generated from the project context.');
    } catch (err) {
      console.error('Shot list generation failed:', err);
      setError(err.message || 'Shot list generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadShotList = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      loadPreviewFromText(text, 'upload');
    } catch (err) {
      console.error('Failed to parse shot list:', err);
      window.alert("Failed to read the file. Please use JSON or plain text.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualPreview = () => {
    if (!manualText.trim()) return;
    loadPreviewFromText(manualText, 'manual');
  };

  const handleApprove = async () => {
    if (!previewShots.length) return;

    setIsApproving(true);
    await onDataUpdate({
      shot_list: previewShots,
      shot_list_meta: {
        source: previewSource || 'unknown',
        coverage_notes: coverageNotes,
        approved_at: new Date().toISOString(),
        required_context: {
          script_scenes: scriptScenes.length,
          transcript_lines: transcript.length,
          timed_words: wordCount,
          characters: characters.length,
          locations: locations.length,
          veo_durations: [4, 6, 8],
          max_shot_duration: 8,
        },
      },
      current_step: 7,
    });
    setIsApproving(false);
    onNavigate(7);
  };

  return (
    <div className="screen active" id="s5" style={{ height: 'calc(100dvh - 52px)', overflow: 'hidden' }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadShotList}
        accept=".json,.txt,application/json,text/plain"
        style={{ display: 'none' }}
      />

      <div style={{
        padding: '18px 28px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '18px',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ ...labelStyle, color: 'var(--orange)', marginBottom: '5px' }}>
            Shotlist Studio
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
            Generate and Approve Shot List
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            AI uses the transcript, timed words, script, characters, and locations before any shots move forward.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-outline" onClick={() => onNavigate(7)} style={{ fontSize: '12px' }}>
            Open Shots
          </button>
          <button
            className="btn-teal"
            onClick={handleApprove}
            disabled={!previewShots.length || isApproving}
            style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
          >
            {isApproving ? 'Approving...' : 'Approve Shot List'}
            {!isApproving && <CheckCircle2 size={14} />}
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))',
        gap: '10px',
        padding: '12px 28px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {contextItems.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              border: `1px solid ${item.ready ? 'rgba(0,184,212,0.18)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px',
              background: item.ready ? 'rgba(0,184,212,0.05)' : 'rgba(255,255,255,0.02)',
              minWidth: 0,
            }}>
              <Icon size={16} color={item.ready ? 'var(--teal)' : 'var(--text-muted)'} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: item.ready ? 'var(--teal)' : 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateRows: previewShots.length ? 'auto minmax(0, 1fr)' : '1fr' }}>
        <div style={{
          padding: '22px 28px',
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 0.95fr) minmax(320px, 1.05fr)',
          gap: '18px',
          overflow: previewShots.length ? 'visible' : 'auto',
        }}>
          <div style={panelStyle}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: 'rgba(0,229,255,0.08)',
                border: '1px solid rgba(0,229,255,0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Sparkles size={20} color="var(--orange)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px' }}>
                  Generate with AI
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
                  The prompt sent to AI includes vocal timing, timed words, the master script, approved cast, and approved locations as required production variables.
                </p>
              </div>
            </div>

            {missingContext.length > 0 && (
              <div style={{
                marginTop: '16px',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: 'var(--text-muted)',
                fontSize: '11px',
                lineHeight: 1.5,
                display: 'flex',
                gap: '9px',
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Missing context: {missingContext.join(', ')}. AI can still work with available material, but the best shot lists use all five.</span>
              </div>
            )}

            {error && (
              <div style={{
                marginTop: '16px',
                border: '1px solid rgba(255,77,77,0.22)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#ff8a8a',
                fontSize: '12px',
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              className="btn-orange"
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate}
              style={{ width: '100%', fontSize: '13px', marginTop: '18px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              <Clapperboard size={15} />
              {isGenerating ? 'Generating Shot List...' : 'Generate Production Shot List'}
            </button>
          </div>

          <div style={panelStyle}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: 'rgba(0,184,212,0.08)',
                border: '1px solid rgba(0,184,212,0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Upload size={19} color="var(--teal)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px' }}>
                  Bring Your Own Shot List
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
                  Upload JSON, paste JSON, or paste one shot per line. Nothing is sent to the Shots tab until you approve the preview.
                </p>
              </div>
            </div>

            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={'Shot 1 - Wide shot of THE ARTIST in Winter Desolation at dusk...\nShot 2 - Close-up timed to the first vocal phrase...'}
              style={{
                width: '100%',
                minHeight: '96px',
                resize: 'vertical',
                marginTop: '16px',
                padding: '12px',
                border: '1px solid var(--border-mid)',
                borderRadius: '8px',
                background: 'var(--surface)',
                color: 'var(--dark)',
                outline: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="btn-outline" onClick={() => fileInputRef.current?.click()} style={{ flex: 1, fontSize: '12px' }}>
                Upload File
              </button>
              <button className="btn-teal" onClick={handleManualPreview} disabled={!manualText.trim()} style={{ flex: 1, fontSize: '12px' }}>
                Preview Mine
              </button>
            </div>
          </div>
        </div>

        {previewShots.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
              padding: '14px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '18px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ ...labelStyle, color: 'var(--teal)', marginBottom: '5px' }}>
                  Preview for Approval
                </div>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--dark)', fontWeight: 700, fontSize: '14px' }}>
                  {previewShots.length} shots from {previewSource || 'preview'}
                </div>
                {coverageNotes && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px', maxWidth: '900px', lineHeight: 1.45 }}>
                    {coverageNotes}
                  </div>
                )}
              </div>
              <button
                className="btn-teal"
                onClick={handleApprove}
                disabled={isApproving}
                style={{ fontSize: '12px', flexShrink: 0 }}
              >
                {isApproving ? 'Approving...' : 'Approve and Arrange Shots'}
              </button>
            </div>

            <div style={{ overflowY: 'auto', minHeight: 0 }}>
              {previewShots.map((shot, index) => (
                <div
                  key={`${shot.n}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '84px minmax(0, 1fr) 210px',
                    gap: '16px',
                    padding: '14px 28px',
                    borderBottom: '1px solid var(--border)',
                    alignItems: 'start',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '11px',
                    color: 'var(--teal)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    {getShotTimingLabel(shot)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--dark)', marginBottom: '5px' }}>
                      {index + 1}. {shot.n}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {shot.p || 'No prompt supplied yet.'}
                    </div>
                    {shot.lyrics && (
                      <div style={{ fontSize: '11px', color: 'rgba(234,234,234,0.58)', fontStyle: 'italic', marginTop: '6px' }}>
                        &ldquo;{shot.lyrics}&rdquo;
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                    {[...(shot.characters || []), ...(shot.locations || [])].slice(0, 4).map(tag => (
                      <span key={tag} style={{
                        maxWidth: '100%',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--border)',
                        color: 'var(--dark)',
                        fontSize: '10px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

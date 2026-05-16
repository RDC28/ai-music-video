'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Eye,
  FileText,
  MapPin,
  Mic2,
  Shirt,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { countTranscriptWords, getProjectAudioDuration, getShotTimingLabel, normalizeShotListForVeo } from '@/utils/shotList';

// Styles moved to components.css as .gen-shot-panel, .form-label

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

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isLegacyWardrobeFallback(outfitName, characterName, locationName) {
  const normalizedOutfit = cleanName(outfitName);
  if (!normalizedOutfit) return false;
  return normalizedOutfit === `${cleanName(characterName)} outfit for ${cleanName(locationName)}`;
}

function hasWardrobeOverride(outfit, locationName) {
  const outfitName = outfit?.outfit_name || outfit?.name || '';
  const hasOnlyLegacyName = outfitName &&
    !outfit?.description &&
    !outfit?.outfit_description &&
    !outfit?.prompt &&
    !outfit?.image_url &&
    !outfit?.imageUrl &&
    !outfit?.url &&
    isLegacyWardrobeFallback(outfitName, outfit?.character_name || outfit?.name, locationName);
  return Boolean(!hasOnlyLegacyName && (
    outfitName ||
    outfit?.description ||
    outfit?.outfit_description ||
    outfit?.prompt ||
    outfit?.image_url ||
    outfit?.imageUrl ||
    outfit?.url
  ));
}

export default function GenerateShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const audioDuration = getProjectAudioDuration(projectData);
  const initialShots = normalizeShotListForVeo(projectData?.shot_list || [], { audioDuration });
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
  const wardrobe = Array.isArray(projectData?.wardrobe) ? projectData.wardrobe : [];
  const wardrobeOutfitCount = wardrobe.reduce((total, location) => (
    total + (Array.isArray(location?.outfits)
      ? location.outfits.filter(outfit => hasWardrobeOverride(outfit, location?.location_name || location?.name)).length
      : 0)
  ), 0);
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
    {
      icon: Shirt,
      label: 'Wardrobe',
      value: `${wardrobeOutfitCount} looks`,
      ready: wardrobeOutfitCount > 0,
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

    const shots = normalizeShotListForVeo(parsed, { audioDuration });
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
      window.alert('Add a story plan or song analysis before creating a production shot list.');
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

      const shots = normalizeShotListForVeo(result.shots, { audioDuration });
      if (!shots.length) throw new Error('No shots were returned');

      setPreviewShots(shots);
      setPreviewSource('ai');
      setCoverageNotes(result.coverage_notes || 'Shot list generated from the project context.');
    } catch (err) {
      console.error('Shot list generation failed:', err);
      setError('Shot plan could not be created. Please try again.');
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
      window.alert("We could not read that file. Please use JSON or plain text.");
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
          audio_duration_seconds: audioDuration,
          script_scenes: scriptScenes.length,
          transcript_lines: transcript.length,
          timed_words: wordCount,
          characters: characters.length,
          locations: locations.length,
          wardrobe_locations: wardrobe.length,
          wardrobe_outfits: wardrobeOutfitCount,
          veo_durations: [4, 6, 8],
          max_shot_duration: 8,
          non_negotiables: [
            'script',
            'shot_concepts',
            'characters',
            'costumes',
            'wardrobe_by_location',
            'locations',
          ],
        },
      },
      current_step: 8,
    });
    setIsApproving(false);
    onNavigate(8);
  };

  return (
    <div className="screen active screen-fill flex-col" id="s7">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadShotList}
        accept=".json,.txt,application/json,text/plain"
        style={{ display: 'none' }}
      />

      {/* HEADER — compact */}
      <div style={{
        padding: '14px 28px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--cyan)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: '3px',
            }}>
              &#9642; Shot &middot; Plan
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: 'var(--text)',
              margin: 0,
              lineHeight: 1.15,
            }}>
              Generate &amp; approve.
            </h1>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, maxWidth: '400px', borderLeft: '1px solid var(--border)', paddingLeft: '16px' }}>
            Build a timed production plan from the song, story, cast, and locations before shots move forward.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-outline" onClick={() => onNavigate(8)} style={{ fontSize: '12px' }}>
            Open shots &rarr;
          </button>
          <button
            className="btn-orange"
            onClick={handleApprove}
            disabled={!previewShots.length || isApproving}
            style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
          >
            {isApproving ? 'Approving…' : 'Approve shot list'}
            {!isApproving && <CheckCircle2 size={13} />}
          </button>
        </div>
      </div>

      {/* CONTEXT STRIP — compact single row */}
      <div style={{
        padding: '8px 28px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {contextItems.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${item.ready ? 'var(--cyan-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '7px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <Icon size={13} color={item.ready ? 'var(--cyan)' : 'var(--text-muted)'} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: item.ready ? 'var(--text)' : 'var(--text-muted)',
                }}>
                  {item.value}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MAIN CONTENT — permanent 2-column: left=actions, right=shot list */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* LEFT COLUMN: Generate (top) + Upload (bottom) */}
        <div style={{
          width: '44%',
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Generate panel — takes remaining space */}
          <div style={{
            flex: 1,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderBottom: '1px solid var(--border)',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: 'var(--bg-deep)', boxShadow: 'var(--neo-raised)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Sparkles size={18} color="var(--cyan)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '5px' }}>
                  Generate Shot Plan
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6, margin: 0 }}>
                  Uses vocal timing, timed words, the master story, approved cast, and locations to keep shots production-ready.
                </p>
              </div>
            </div>

            {(error || missingContext.length > 0) && (
              <div style={{
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: 'var(--radius)', padding: '10px 12px',
                display: 'flex', gap: '8px', alignItems: 'flex-start',
              }}>
                <AlertCircle size={13} color="#F87171" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span style={{ fontSize: '12px', color: '#F87171', lineHeight: 1.5 }}>
                  {error || `Missing: ${missingContext.join(', ')}. You can still generate with what's available.`}
                </span>
              </div>
            )}

            <button
              className="btn-orange"
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate}
              style={{ width: '100%', fontSize: '13px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              <Clapperboard size={15} />
              {isGenerating ? 'Generating shot plan…' : 'Generate Shot Plan'}
            </button>
          </div>

          {/* Upload panel — pinned at bottom */}
          <div style={{
            flexShrink: 0,
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'var(--bg-deep)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={13} color="var(--text-muted)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                Bring Your Own Shot List
              </span>
            </div>
            <textarea
              className="textarea-inset"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={'Shot 1 - Wide shot of THE ARTIST...\nShot 2 - Close-up at first vocal phrase...'}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', height: '80px' }}
              onFocus={e => { e.target.style.borderColor = 'var(--cyan-border)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-outline"
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: '11px', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={12} /> Upload File
              </button>
              <button
                className="btn-outline"
                onClick={handleManualPreview}
                disabled={!manualText.trim()}
                style={{ fontSize: '11px', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={12} /> Preview Mine
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Shot list preview — takes all remaining height */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {previewShots.length > 0 ? (
            <>
              {/* Preview header */}
              <div style={{
                padding: '10px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                gap: '12px',
                background: 'rgba(17,17,20,0.8)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--cyan)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>
                    &#9642; Preview
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                    {previewShots.length} shots
                  </div>
                  {coverageNotes && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {coverageNotes}
                    </div>
                  )}
                </div>
                <button
                  className="btn-teal"
                  onClick={handleApprove}
                  disabled={isApproving}
                  style={{ fontSize: '11px', flexShrink: 0, padding: '7px 14px' }}
                >
                  {isApproving ? 'Approving...' : 'Approve and Arrange'}
                </button>
              </div>

              {/* Shot rows — scrollable full height */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
                {previewShots.map((shot, index) => (
                  <div
                    key={`${shot.n}-${index}`}
                    style={{
                      padding: '11px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'grid',
                      gridTemplateColumns: '64px 1fr 160px',
                      gap: '12px',
                      alignItems: 'start',
                    }}
                  >
                    {/* Timing */}
                    <div style={{
                      background: 'var(--bg-deep)',
                      boxShadow: 'var(--neo-inset)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '6px 8px',
                      textAlign: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--cyan)' }}>
                        {getShotTimingLabel(shot)}
                      </span>
                    </div>

                    {/* Shot info */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: '3px',
                        letterSpacing: '-0.01em',
                      }}>
                        {index + 1}. {shot.n}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {shot.p || 'No prompt supplied yet.'}
                      </div>
                      {shot.lyrics && (
                        <div style={{
                          fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
                          marginTop: '4px', borderLeft: '2px solid var(--border-mid)', paddingLeft: '7px',
                        }}>
                          &ldquo;{shot.lyrics}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[...(shot.characters || []), ...(shot.locations || [])].slice(0, 4).map(tag => (
                        <span key={tag} className="tag-badge">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '14px',
              padding: '40px 24px', textAlign: 'center',
            }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clapperboard size={22} color="var(--cyan)" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px', letterSpacing: '-0.02em' }}>
                  No shots yet
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '240px' }}>
                  Generate a shot plan or paste your own to see the preview here.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

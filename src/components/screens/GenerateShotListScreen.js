'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
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
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

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

export default function GenerateShotListScreen({ onNavigate, projectId, projectData, onDataUpdate }) {
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
    <div className="screen active screen-fill" id="s7">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadShotList}
        accept=".json,.txt,application/json,text/plain"
        style={{ display: 'none' }}
      />

      <WorkflowThreePaneShell
        showLeftPanel={false}
        sidebarTitle="Context"
        rightTitle="Plan Actions"
        storageKey="workflow-three-pane:s7"
        sidebar={(
          <div className="flex-col gap-10" style={{ padding: '0.875rem' }}>
            <div className="panel-flat">
              <div className="panel-meta-label">▪ Shot Plan Context</div>
              <p className="body-sm">These sources are used to generate production-safe shots.</p>
            </div>
            <div className="panel-flat">
              <div className="flex-col gap-8">
                {contextItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius)',
                      border: `0.0625rem solid ${item.ready ? 'var(--cyan-border)' : 'var(--border)'}`,
                      background: item.ready ? 'rgba(var(--cyan-rgb), 0.06)' : 'var(--bg-deep)',
                    }}>
                      <Icon size={13} color={item.ready ? 'var(--cyan)' : 'var(--text-muted)'} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700 }}>{item.value}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{item.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        main={(
          <div className="flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="panel-header">
              <div>
                <div className="sidebar-header-kicker">▪ Shot · Plan</div>
                <h1 className="shot-screen-title" style={{ fontSize: '2rem', whiteSpace: 'normal' }}>Generate &amp; approve.</h1>
                <p className="body-sm" style={{ marginTop: '0.5rem', maxWidth: '40rem' }}>
                  Build a timed production plan from the song, story, cast, and locations before shots move forward.
                </p>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {previewShots.length > 0 ? (
                <>
                  <div style={{
                    padding: '0.625rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '0.0625rem solid var(--border)',
                    flexShrink: 0,
                    gap: '0.75rem',
                    background: 'rgba(var(--ink-900-rgb), 0.8)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--cyan)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>
                        &#9642; Preview
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                        {previewShots.length} shots
                      </div>
                      {coverageNotes && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {coverageNotes}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={handleApprove}
                      disabled={isApproving}
                      style={{ fontSize: '0.6875rem', flexShrink: 0, padding: '0.4375rem 0.875rem' }}
                    >
                      {isApproving ? 'Approving...' : 'Approve and Arrange'}
                    </button>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.25rem' }}>
                    {previewShots.map((shot, index) => (
                      <div
                        key={`${shot.n}-${index}`}
                        style={{
                          padding: '0.6875rem 0',
                          borderBottom: '0.0625rem solid var(--border)',
                          display: 'grid',
                          gridTemplateColumns: '4rem 1fr 10rem',
                          gap: '0.75rem',
                          alignItems: 'start',
                        }}
                      >
                        <div style={{
                          background: 'var(--bg-deep)',
                          boxShadow: 'var(--neo-inset)',
                          border: '0.0625rem solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '0.375rem 0.5rem',
                          textAlign: 'center',
                        }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--cyan)' }}>
                            {getShotTimingLabel(shot)}
                          </span>
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: 'var(--text)',
                            marginBottom: '0.1875rem',
                            letterSpacing: '-0.01em',
                          }}>
                            {index + 1}. {shot.n}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {shot.p || 'No prompt supplied yet.'}
                          </div>
                          {shot.lyrics && (
                            <div style={{
                              fontSize: '0.6875rem', color: 'var(--text-muted)', fontStyle: 'italic',
                              marginTop: '0.25rem', borderLeft: '0.125rem solid var(--border-mid)', paddingLeft: '0.4375rem',
                            }}>
                              &ldquo;{shot.lyrics}&rdquo;
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {[...(shot.characters || []), ...(shot.locations || [])].slice(0, 4).map(tag => (
                            <span key={tag} className="tag-badge">{tag}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '0.875rem',
                  padding: '2.5rem 1.5rem', textAlign: 'center',
                }}>
                  <div style={{
                    width: '3.25rem', height: '3.25rem', borderRadius: '0.875rem',
                    background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Clapperboard size={22} color="var(--cyan)" />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.375rem', letterSpacing: '-0.02em' }}>
                      No shots yet
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '15rem' }}>
                      Generate a shot plan or paste your own to see the preview here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        right={(
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

              <div className="panel-flat">
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem',
                    background: 'var(--bg-deep)', boxShadow: 'var(--neo-raised)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Sparkles size={18} color="var(--cyan)" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.3125rem' }}>
                      Generate Shot Plan
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.6, margin: 0 }}>
                      Uses vocal timing, timed words, the master story, approved cast, and locations to keep shots production-ready.
                    </p>
                  </div>
                </div>

                {(error || missingContext.length > 0) && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: 'rgba(var(--violet-rgb), 0.06)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.2)',
                    borderRadius: 'var(--radius)', padding: '0.625rem 0.75rem',
                    display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                  }}>
                    <AlertCircle size={13} color="var(--violet-400)" style={{ flexShrink: 0, marginTop: '0.0625rem' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--violet-400)', lineHeight: 1.5 }}>
                      {error || `Missing: ${missingContext.join(', ')}. You can still generate with what's available.`}
                    </span>
                  </div>
                )}

                <button
                  className="btn-action-generate"
                  onClick={handleGenerate}
                  disabled={isGenerating || !canGenerate}
                  style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.8125rem', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Clapperboard size={15} />
                  {isGenerating ? 'Generating shot plan…' : 'Generate Shot Plan'}
                </button>
              </div>

              <div className="panel-flat">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  <Upload size={13} color="var(--text-muted)" />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
                    Bring Your Own Shot List
                  </span>
                </div>
                <textarea
                  className="textarea-inset"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder={'Shot 1 - Wide shot of THE ARTIST...\nShot 2 - Close-up at first vocal phrase...'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', height: '5rem' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn-outline"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: '0.6875rem', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Upload size={12} /> Upload File
                  </button>
                  <button
                    className="btn-outline"
                    onClick={handleManualPreview}
                    disabled={!manualText.trim()}
                    style={{ fontSize: '0.6875rem', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Eye size={12} /> Preview Mine
                  </button>
                </div>
              </div>

              <div className="panel-flat" style={{ marginTop: 'auto' }}>
                <div className="panel-meta-label">Tip</div>
                <p className="body-sm">
                  Approve the list from the center panel. Use the left stage bar to move to Shots.
                </p>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}

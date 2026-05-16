'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { getPlannedVideoDuration, getProjectAudioDuration, getShotTimingLabel, normalizeShot, normalizeShotListForVeo } from '@/utils/shotList';

// Styles moved to components.css as .input-inset, .form-label, .icon-btn

const splitTags = (value) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export default function ShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const audioDuration = useMemo(() => getProjectAudioDuration(projectData), [projectData]);
  const shots = useMemo(
    () => normalizeShotListForVeo(projectData?.shot_list || [], { audioDuration }),
    [audioDuration, projectData?.shot_list]
  );
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const hasActiveEdit = editingIndex !== null && Boolean(shots[editingIndex]) && Boolean(editDraft);

  const commitShots = async (nextShots, extra = {}) => {
    await onDataUpdate({
      shot_list: nextShots.map((shot, index) => normalizeShot(shot, index)),
      ...extra,
    });
  };

  const startEditing = (index) => {
    setEditingIndex(index);
    setEditDraft({
      ...shots[index],
      charactersText: (shots[index].characters || []).join(', '),
      locationsText: (shots[index].locations || []).join(', '),
    });
  };

  const closeEditing = () => {
    setEditingIndex(null);
    setEditDraft(null);
  };

  const handleMove = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= shots.length) return;
    const next = [...shots];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    await commitShots(next);
    if (editingIndex === index) {
      setEditingIndex(target);
    }
  };

  const handleDuplicate = async (index) => {
    const next = [...shots];
    const duplicate = {
      ...shots[index],
      n: `${shots[index].n} Copy`,
    };
    next.splice(index + 1, 0, duplicate);
    await commitShots(next);
    setEditingIndex(index + 1);
    setEditDraft({
      ...duplicate,
      charactersText: (duplicate.characters || []).join(', '),
      locationsText: (duplicate.locations || []).join(', '),
    });
  };

  const handleDelete = async (index) => {
    const next = shots.filter((_, shotIndex) => shotIndex !== index);
    await commitShots(next);
    closeEditing();
  };

  const handleAddShot = async () => {
    const nextShot = {
      n: `Shot ${shots.length + 1}`,
      p: '',
      image_prompt: '',
      video_prompt: '',
      duration: 6,
      veo_duration_seconds: 6,
      characters: [],
      locations: [],
      movement: 'static',
      camera: 'plain 16:9 source-footage framing',
    };
    const next = [...shots, nextShot];
    await commitShots(next);
    setEditingIndex(next.length - 1);
    setEditDraft({
      ...nextShot,
      charactersText: '',
      locationsText: '',
    });
  };

  const handleSave = async () => {
    if (editingIndex === null || !editDraft) return;
    const { charactersText, locationsText, ...draftFields } = editDraft;
    const start = editDraft.start === '' ? undefined : Number(editDraft.start);
    const end = editDraft.end === '' ? undefined : Number(editDraft.end);
    const requestedDuration = editDraft.duration === '' ? shots[editingIndex].duration : Number(editDraft.duration);
    const duration = Number(Math.min(Math.max(requestedDuration, 0.1), 8).toFixed(2));
    const veoDuration = getPlannedVideoDuration({ ...shots[editingIndex], ...draftFields, duration }, 6);
    const next = [...shots];
    next[editingIndex] = normalizeShot({
      ...shots[editingIndex],
      ...draftFields,
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(start) ? Number((start + duration).toFixed(2)) : (Number.isFinite(end) ? end : undefined),
      duration: Number.isFinite(duration) ? duration : 6,
      veo_duration_seconds: veoDuration,
      characters: splitTags(charactersText || ''),
      locations: splitTags(locationsText || ''),
    }, editingIndex);
    await commitShots(next);
    closeEditing();
  };

  const handleContinue = async () => {
    await commitShots(shots, { shots_arranged: true, current_step: 9 });
    onNavigate(9);
  };

  return (
    <div className="screen active screen-row" id="s8">

      {/* LEFT PANEL */}
      <div className="layout-main">

        {/* Header */}
        <div className="panel-header" style={{ gap: '18px' }}>
          <div>
            <div className="sidebar-header-kicker">▪ Shots · Sequence</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', margin: 0, lineHeight: 1.1, marginBottom: shots.length > 0 ? '8px' : 0 }}>
              Arrange the cuts.
            </h1>
            {shots.length > 0 && (
              <p className="body-sm" style={{ margin: 0 }}>
                {`${shots.length} approved shots ready to reorder, edit, and send to image generation.`}
              </p>
            )}
          </div>

          <div className="flex-row gap-8" style={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', paddingTop: '4px' }}>
            <button className="btn-outline" onClick={() => onNavigate(7)} style={{ fontSize: '12px' }}>← Shot Plan</button>
            <button className="btn-outline" onClick={handleAddShot} style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> + Add shot
            </button>
            <button className="btn-orange" onClick={handleContinue} disabled={!shots.length} style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
              Continue to Frames <CheckCircle2 size={14} />
            </button>
          </div>
        </div>

        {/* Coverage notes */}
        {projectData?.shot_list_meta?.coverage_notes && (
          <div style={{
            padding: '10px 28px',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            lineHeight: 1.5,
            flexShrink: 0,
          }}>
            {projectData.shot_list_meta.coverage_notes}
          </div>
        )}

        {/* Shots list */}
        <div id="shotListItems" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {shots.length > 0 ? (
            shots.map((shot, index) => (
              <div
                key={`${shot.n}-${index}`}
                style={{
                  padding: '12px 28px',
                  borderBottom: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '44px 88px 1fr auto',
                  gap: '14px',
                  alignItems: 'start',
                  background: editingIndex === index ? 'var(--cyan-dim)' : 'transparent',
                  borderLeft: `3px solid ${editingIndex === index ? 'var(--cyan)' : 'transparent'}`,
                  transition: 'background 0.2s',
                }}
              >
                {/* Col 1: Shot number badge */}
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface-2)',
                  boxShadow: editingIndex === index ? 'var(--neo-active)' : 'var(--neo-flat)',
                  border: editingIndex === index ? '1px solid var(--cyan-border)' : '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: editingIndex === index ? 'var(--cyan)' : 'var(--text-muted)',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>
                  {String(index + 1).padStart(2, '0')}
                </div>

                {/* Col 2: Timing */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--cyan)',
                  paddingTop: '8px',
                  letterSpacing: '0.06em',
                }}>
                  {getShotTimingLabel(shot, audioDuration)}
                </div>

                {/* Col 3: Content */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: editingIndex === index ? 'var(--cyan)' : 'var(--text)',
                    marginBottom: '4px',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}>
                    {shot.n}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.55,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    marginBottom: '6px',
                  }}>
                    {shot.p || 'No prompt supplied yet.'}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {[shot.shot_size, shot.movement, (shot.characters || [])[0], (shot.locations || [])[0]]
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="tag-badge"
                          style={{ fontSize: '9.5px' }}
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Col 4: Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                  <button className="icon-btn" style={{ opacity: index === 0 ? 0.25 : 1 }} onClick={() => handleMove(index, -1)} disabled={index === 0} title="Move up">
                    <ArrowUp size={13} />
                  </button>
                  <button className="icon-btn" style={{ opacity: index === shots.length - 1 ? 0.25 : 1 }} onClick={() => handleMove(index, 1)} disabled={index === shots.length - 1} title="Move down">
                    <ArrowDown size={13} />
                  </button>
                  <button className="icon-btn" onClick={() => handleDuplicate(index)} title="Duplicate">
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => startEditing(index)}
                    style={{
                      background: 'var(--surface-2)',
                      boxShadow: editingIndex === index ? 'var(--neo-inset)' : 'var(--neo-flat)',
                      border: editingIndex === index ? '1px solid var(--cyan-border)' : '1px solid var(--border)',
                      color: editingIndex === index ? 'var(--cyan)' : 'var(--text-muted)',
                      fontSize: '11px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    Edit
                  </button>
                  <button className="icon-btn" style={{ color: 'var(--error)' }} onClick={() => handleDelete(index)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              padding: '80px 40px',
              gap: '16px',
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                boxShadow: 'var(--neo-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-2)',
              }}>
                <SlidersHorizontal size={22} color="var(--cyan)" />
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text)',
                textAlign: 'center',
              }}>
                No approved shots yet.
              </div>
              <button className="btn-teal" onClick={() => onNavigate(7)} style={{ fontSize: '12px' }}>
                Generate or Import Shot List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Edit sidebar */}
      {hasActiveEdit && (
        <div className="edit-side-panel" style={{ width: '420px', animation: 'slideInRight 0.22s cubic-bezier(0.2, 0, 0, 1)' }}>
          {/* Sidebar header */}
          <div style={{ position: 'relative', marginBottom: '0' }}>
            <div className="sidebar-header-kicker" style={{ marginBottom: '6px' }}>
              ▪ Editing · Shot {String(editingIndex + 1).padStart(2, '0')}
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Shot details.
            </h3>
            <button
              onClick={closeEditing}
              className="modal-close-btn"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, marginTop: '16px' }}>

            {/* Shot Title */}
            <div>
              <label className="form-label">Shot Title</label>
              <input
                type="text"
                value={editDraft.n || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, n: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Start / End / Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Start</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.start ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, start: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">End</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.end ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, end: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Duration</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.duration ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, duration: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Timeline duration up to 8s. Clip: {getPlannedVideoDuration(editDraft, 6)}s.
                </div>
              </div>
            </div>

            {/* Characters */}
            <div>
              <label className="form-label">Characters</label>
              <input
                type="text"
                value={editDraft.charactersText || ''}
                placeholder="THE ARTIST, THE MUSE"
                onChange={(e) => setEditDraft(prev => ({ ...prev, charactersText: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Locations */}
            <div>
              <label className="form-label">Locations</label>
              <input
                type="text"
                value={editDraft.locationsText || ''}
                placeholder="Winter Desolation"
                onChange={(e) => setEditDraft(prev => ({ ...prev, locationsText: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Shot Size + Movement */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Shot Size</label>
                <input
                  type="text"
                  value={editDraft.shot_size || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, shot_size: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Movement</label>
                <input
                  type="text"
                  value={editDraft.movement || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, movement: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
            </div>

            {/* Camera */}
            <div>
              <label className="form-label">Camera</label>
              <input
                type="text"
                value={editDraft.camera || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, camera: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Vocal Cue */}
            <div>
              <label className="form-label">Vocal Cue</label>
              <input
                type="text"
                value={editDraft.lyrics || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, lyrics: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Textareas */}
            <div>
              <label className="form-label">Master Shot Brief</label>
              <textarea
                className="textarea-inset"
                value={editDraft.p || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, p: e.target.value }))}
                style={{ minHeight: '110px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <div>
              <label className="form-label">Still Image Prompt</label>
              <textarea
                className="textarea-inset"
                value={editDraft.image_prompt || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, image_prompt: e.target.value }))}
                style={{ minHeight: '120px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <div>
              <label className="form-label">Video Prompt</label>
              <textarea
                className="textarea-inset"
                value={editDraft.video_prompt || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, video_prompt: e.target.value }))}
                style={{ minHeight: '140px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <button
              className="btn-orange"
              style={{ width: '100%', marginTop: 'auto' }}
              onClick={handleSave}
            >
              Save Shot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
import { getShotTimingLabel, normalizeShot, normalizeShotList } from '@/utils/shotList';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border-mid)',
  borderRadius: '8px',
  background: 'var(--surface)',
  color: 'var(--dark)',
  fontSize: '13px',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '6px',
  fontFamily: 'var(--font-display)',
};

const splitTags = (value) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export default function ShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const shots = useMemo(
    () => normalizeShotList(projectData?.shot_list || []),
    [projectData?.shot_list]
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
      duration: 5,
      characters: [],
      locations: [],
      movement: 'static',
      camera: '16:9 cinematic framing',
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
    const duration = editDraft.duration === '' ? 5 : Number(editDraft.duration);
    const next = [...shots];
    next[editingIndex] = normalizeShot({
      ...shots[editingIndex],
      ...draftFields,
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(end) ? end : undefined,
      duration: Number.isFinite(duration) ? duration : 5,
      characters: splitTags(charactersText || ''),
      locations: splitTags(locationsText || ''),
    }, editingIndex);
    await commitShots(next);
    closeEditing();
  };

  const handleContinue = async () => {
    await commitShots(shots, { shots_arranged: true, current_step: 8 });
    onNavigate(8);
  };

  return (
    <div className="screen active" id="s5" style={{ flexDirection: 'row', alignItems: 'flex-start', height: 'calc(100dvh - 52px)', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', height: '100%' }}>
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
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.11em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Shots Tab
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
              Arrange Individual Shots
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {shots.length > 0
                ? `${shots.length} approved shots ready to reorder, edit, and send to image generation`
                : 'No approved shots yet. Generate or import a shot list first.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <button className="btn-outline" onClick={() => onNavigate(6)} style={{ fontSize: '12px' }}>
              Back to Shotlist
            </button>
            <button className="btn-outline" onClick={handleAddShot} style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} />
              Add Shot
            </button>
            <button
              className="btn-teal"
              onClick={handleContinue}
              disabled={!shots.length}
              style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
            >
              Continue to Images
              <CheckCircle2 size={14} />
            </button>
          </div>
        </div>

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

        <div id="shotListItems" style={{ flex: 1, overflowY: 'auto' }}>
          {shots.length > 0 ? (
            shots.map((shot, index) => (
              <div
                key={`${shot.n}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 96px minmax(0, 1fr) auto',
                  gap: '16px',
                  alignItems: 'start',
                  padding: '16px 28px',
                  borderBottom: '1px solid var(--border)',
                  background: editingIndex === index ? 'rgba(0,184,212,0.04)' : 'transparent',
                  borderLeft: `3px solid ${editingIndex === index ? 'var(--teal)' : 'transparent'}`,
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: editingIndex === index ? 'var(--teal)' : 'var(--dark)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '12px',
                  fontWeight: 800,
                }}>
                  {index + 1}
                </div>

                <div style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, paddingTop: '4px' }}>
                  {getShotTimingLabel(shot)}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: editingIndex === index ? 'var(--teal)' : 'var(--dark)',
                    marginBottom: '5px',
                    letterSpacing: '-0.01em',
                  }}>
                    {shot.n}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {shot.p || 'No prompt supplied yet.'}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {[...(shot.characters || []), ...(shot.locations || []), shot.shot_size, shot.movement]
                      .filter(Boolean)
                      .slice(0, 6)
                      .map(tag => (
                        <span key={tag} style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border)',
                          color: 'rgba(234,234,234,0.68)',
                          fontSize: '10px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-display)',
                        }}>
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <button className="btn-outline" onClick={() => handleMove(index, -1)} disabled={index === 0} title="Move up" style={{ padding: '7px 8px', opacity: index === 0 ? 0.35 : 1 }}>
                    <ArrowUp size={14} />
                  </button>
                  <button className="btn-outline" onClick={() => handleMove(index, 1)} disabled={index === shots.length - 1} title="Move down" style={{ padding: '7px 8px', opacity: index === shots.length - 1 ? 0.35 : 1 }}>
                    <ArrowDown size={14} />
                  </button>
                  <button className="btn-outline" onClick={() => handleDuplicate(index)} title="Duplicate" style={{ padding: '7px 8px' }}>
                    <Copy size={14} />
                  </button>
                  <button
                    className="btn-outline"
                    style={{ fontSize: '11px', padding: '7px 12px', opacity: editingIndex === index ? 0.45 : 1 }}
                    onClick={() => startEditing(index)}
                  >
                    {editingIndex === index ? 'Editing' : 'Edit'}
                  </button>
                  <button className="btn-outline" onClick={() => handleDelete(index)} title="Delete" style={{ padding: '7px 8px', color: '#ff6b6b' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '80px 40px', gap: '12px' }}>
              <SlidersHorizontal size={26} color="var(--text-muted)" />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No approved shots yet.
              </div>
              <button className="btn-teal" onClick={() => onNavigate(6)} style={{ fontSize: '12px' }}>
                Generate or Import Shot List
              </button>
            </div>
          )}
        </div>
      </div>

      {hasActiveEdit && (
        <div style={{
          position: 'sticky',
          top: 0,
          width: '430px',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-mid)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: '4px' }}>Edit Shot {editingIndex + 1}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
                Shot Details
              </div>
            </div>
            <button
              onClick={closeEditing}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '22px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >x</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            <div>
              <label style={labelStyle}>Shot Title</label>
              <input
                type="text"
                value={editDraft.n || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, n: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Start</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.start ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, start: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>End</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.end ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, end: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Duration</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.duration ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, duration: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Characters</label>
              <input
                type="text"
                value={editDraft.charactersText || ''}
                placeholder="THE ARTIST, THE MUSE"
                onChange={(e) => setEditDraft(prev => ({ ...prev, charactersText: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Locations</label>
              <input
                type="text"
                value={editDraft.locationsText || ''}
                placeholder="Winter Desolation"
                onChange={(e) => setEditDraft(prev => ({ ...prev, locationsText: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Shot Size</label>
                <input
                  type="text"
                  value={editDraft.shot_size || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, shot_size: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Movement</label>
                <input
                  type="text"
                  value={editDraft.movement || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, movement: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Camera</label>
              <input
                type="text"
                value={editDraft.camera || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, camera: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Vocal / Lyric Cue</label>
              <input
                type="text"
                value={editDraft.lyrics || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, lyrics: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Image / Video Prompt</label>
              <textarea
                value={editDraft.p || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, p: e.target.value }))}
                style={{ ...inputStyle, minHeight: '180px', resize: 'vertical', flex: 1, lineHeight: 1.5 }}
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

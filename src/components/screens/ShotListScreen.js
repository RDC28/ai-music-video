'use client';

import { useState } from 'react';

export default function ShotListScreen({ onNavigate, projectData, onDataUpdate }) {
  const characters = projectData?.characters || [];
  const localShots = projectData?.shot_list || [];
  const [editingIndex, setEditingIndex] = useState(null);

  const handleEditClick = (index) => {
    setEditingIndex(index);
  };

  const handleCloseEdit = () => {
    setEditingIndex(null);
  };

  const handleSave = async (index, newTitle, newPrompt) => {
    const updated = [...localShots];
    updated[index] = { ...updated[index], n: newTitle, p: newPrompt };
    await onDataUpdate({ shot_list: updated });
    setEditingIndex(null);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
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

  return (
    <div className="screen active" id="s5" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', height: '100%' }}>

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
              Review Shot List
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {localShots.length > 0
                ? `${localShots.length} shots — review and edit before generating images`
                : 'No shots yet — go back to generate or upload a shot list'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {characters.length > 0 && (
              <div style={{ display: 'flex', gap: '5px', marginRight: '8px' }}>
                {characters.slice(0, 4).map((char, i) => (
                  <div key={i} style={{
                    padding: '3px 10px',
                    background: 'rgba(0,184,212,0.08)',
                    border: '1px solid rgba(0,184,212,0.15)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--teal)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {char.name}
                  </div>
                ))}
              </div>
            )}
            <button className="btn-teal" onClick={() => onNavigate(8)} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Approve All
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Shot list */}
        <div id="shotListItems" style={{ flex: 1, overflowY: 'auto' }}>
          {localShots.length > 0 ? (
            localShots.map((shot, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 28px',
                  borderBottom: '1px solid var(--border)',
                  background: editingIndex === i ? 'rgba(0,184,212,0.04)' : 'transparent',
                  borderLeft: `3px solid ${editingIndex === i ? 'var(--teal)' : 'transparent'}`,
                  transition: 'all 0.2s',
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: editingIndex === i ? 'var(--teal)' : 'var(--dark)',
                    marginBottom: '4px',
                    letterSpacing: '-0.01em',
                  }}>
                    {i + 1}. {shot.n}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    &quot;{shot.p}&quot;
                  </div>
                </div>
                <button
                  className="btn-outline"
                  style={{
                    fontSize: '11px',
                    padding: '6px 14px',
                    flexShrink: 0,
                    opacity: editingIndex === i ? 0.4 : 1,
                    cursor: editingIndex === i ? 'default' : 'pointer',
                  }}
                  onClick={() => handleEditClick(i)}
                >
                  {editingIndex === i ? 'Editing...' : 'Edit'}
                </button>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '80px 40px', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No shots generated yet.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(6)} style={{ fontSize: '12px' }}>
                ← Go Back to Generate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Side Panel */}
      {editingIndex !== null && (
        <div style={{
          position: 'sticky',
          top: 0,
          width: '420px',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-mid)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
              Edit Shot {editingIndex + 1}
            </div>
            <button
              onClick={handleCloseEdit}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                Shot Title
              </label>
              <input
                type="text"
                defaultValue={localShots[editingIndex].n}
                id="editShotTitle"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                Shot Description / Prompt
              </label>
              <textarea
                defaultValue={localShots[editingIndex].p}
                id="editShotPrompt"
                style={{ ...inputStyle, minHeight: '180px', resize: 'vertical', flex: 1 }}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />
            </div>

            <button
              className="btn-orange"
              style={{ width: '100%', marginTop: 'auto' }}
              onClick={() => {
                const title = document.getElementById('editShotTitle').value;
                const prompt = document.getElementById('editShotPrompt').value;
                handleSave(editingIndex, title, prompt);
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

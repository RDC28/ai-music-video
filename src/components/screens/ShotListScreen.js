'use client';

import { useState } from 'react';
import { shots as initialShots } from '@/data/shots';

export default function ShotListScreen({ onNavigate }) {
  const [localShots, setLocalShots] = useState(initialShots);
  const [editingIndex, setEditingIndex] = useState(null);

  const handleEditClick = (index) => {
    setEditingIndex(index);
  };

  const handleCloseEdit = () => {
    setEditingIndex(null);
  };

  const handleSave = (index, newTitle, newPrompt) => {
    const updated = [...localShots];
    updated[index] = { ...updated[index], n: newTitle, p: newPrompt };
    setLocalShots(updated);
    setEditingIndex(null);
  };

  return (
    <div className="screen active" id="s5" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>

      <div className="shot-layout" style={{ minWidth: 0 }}>
        <div className="shot-header" style={{ position: 'sticky', top: '64px', zIndex: 10, justifyContent: 'space-between', padding: '16px 28px', paddingTop: '32px', background: 'var(--cream)', borderRadius: '16px', border: '2px solid var(--border)', marginBottom: '32px' }}>
          
          <div className="chars-preview">
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#8B4513,#D2691E)',
                }}
              />
              <div className="char-badge">ZAIN</div>
            </div>
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#9B59B6,#E8A0BF)',
                }}
              />
              <div className="char-badge">NAISHA</div>
            </div>
            <div style={{ width: '12px' }} />
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#2E8B57,#3CB371)',
                }}
              />
              <div className="char-badge" style={{ background: '#3CB371' }}>CAFE</div>
            </div>
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#556B2F,#6B8E23)',
                }}
              />
              <div className="char-badge" style={{ background: '#6B8E23' }}>PARK</div>
            </div>
          </div>

          <button className="btn-approve" onClick={() => onNavigate(8)}>
            APPROVE ALL
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7"></path>
            </svg>
          </button>
        </div>

        <div id="shotListItems">
          {localShots.map((shot, i) => (
            <div 
              key={i} 
              className="shot-item"
              style={{
                background: editingIndex === i ? 'rgba(61, 140, 122, 0.08)' : 'transparent',
                borderLeft: editingIndex === i ? '4px solid var(--teal)' : '4px solid transparent',
                paddingLeft: '16px',
                paddingRight: '16px',
                borderRadius: editingIndex === i ? '0 12px 12px 0' : '0',
                transition: 'all 0.2s ease',
                borderBottomColor: editingIndex === i ? 'transparent' : 'var(--border)'
              }}
            >
              <div>
                <div className="shot-title" style={{ color: editingIndex === i ? 'var(--teal)' : 'var(--dark)' }}>{i + 1}. {shot.n}</div>
                <div className="shot-prompt">&quot;{shot.p}&quot;</div>
              </div>
              <div className="shot-actions">
                <button
                  className="btn-teal"
                  style={{ 
                    fontSize: '10px', 
                    padding: '7px 14px',
                    opacity: editingIndex === i ? 0.5 : 1,
                    cursor: editingIndex === i ? 'default' : 'pointer'
                  }}
                  onClick={() => handleEditClick(i)}
                >
                  {editingIndex === i ? 'EDITING...' : 'EDIT'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side Window */}
      {editingIndex !== null && (
        <div style={{
          position: 'sticky',
          top: '90px',
          width: '450px',
          height: 'calc(100vh - 114px)',
          background: 'var(--card)',
          border: '2px solid var(--border)',
          borderRight: 'none',
          borderRadius: '24px 0 0 24px',
          boxShadow: '-8px 0 24px rgba(42, 38, 34, 0.05)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0
        }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div className="card-title" style={{ border: 'none', padding: 0, margin: 0 }}>Edit Shot</div>
              <button className="auth-close" style={{ position: 'static' }} onClick={handleCloseEdit}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>SHOT TITLE</label>
                <input 
                  type="text" 
                  defaultValue={localShots[editingIndex].n} 
                  id="editShotTitle"
                  style={{ width: '100%', padding: '12px 16px', border: '2px solid var(--border)', borderRadius: '12px', fontFamily: 'var(--font-body)', fontSize: '14px', outline: 'none' }} 
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>SHOT DESCRIPTION (PROMPT)</label>
                <textarea 
                  defaultValue={localShots[editingIndex].p} 
                  id="editShotPrompt"
                  style={{ width: '100%', minHeight: '200px', padding: '12px 16px', border: '2px solid var(--border)', borderRadius: '12px', fontFamily: 'var(--font-body)', fontSize: '14px', resize: 'vertical', outline: 'none' }} 
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
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

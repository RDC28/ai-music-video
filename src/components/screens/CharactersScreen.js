'use client';

import { useState, useEffect } from 'react';
import { geminiAgent } from '@/utils/geminiAgents';

const charColors = [
  '#8B6F47', '#A0522D', '#6B4423', '#4A3728',
  '#C4956A', '#7D5A3C', '#593D2B', '#8B7355',
  '#6E5040', '#4E342E', '#3E2723', '#795548',
];

export default function CharactersScreen({ onNavigate, projectData = [], onDataUpdate, projectId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Local state for the new character being created
  const [newChar, setNewChar] = useState({ name: '', description: '' });

  const characters = projectData || [];

  const handleAddCharacter = async () => {
    if (!newChar.name) return alert("Please enter a name");
    
    const updatedChars = [...characters, { 
      id: Date.now(), 
      name: newChar.name.toUpperCase(), 
      description: newChar.description,
      images: [] 
    }];
    
    await onDataUpdate({ characters: updatedChars });
    setShowCreateModal(false);
    setNewChar({ name: '', description: '' });
    setActiveTab(updatedChars.length - 1);
  };

  const handleRemoveCharacter = async (index) => {
    const updatedChars = characters.filter((_, i) => i !== index);
    await onDataUpdate({ characters: updatedChars });
    if (activeTab >= updatedChars.length) {
      setActiveTab(Math.max(0, updatedChars.length - 1));
    }
  };

  const activeChar = characters[activeTab] || null;

  return (
    <div className="screen active" id="s4">
      <div className="char-layout">
        {/* Left Panel */}
        <div className="char-panel">
          <div className="notif-card">
            <div className="notif-title">Notification</div>
            <div className="notif-big">Fantastic!</div>
            <div className="notif-body">
              Now since we have the song sorted. Let&apos;s pick characters or
              create new before we start cooking up visuals?
            </div>
          </div>

          <div className="preview-box" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              className="btn-outline" 
              style={{ width: '100%' }}
              onClick={() => setShowCreateModal(true)}
            >
              Let&apos;s create
            </button>
            
            <div className="char-grid-btn-row">
              <button className="btn-teal" onClick={() => setShowHistoryModal(true)}>From History</button>
              <button className="btn-teal" onClick={() => onNavigate(5)}>
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Character Sheet */}
        <div className="char-sheet">
          <div style={{ position: 'sticky', top: '64px', zIndex: 10, background: 'var(--cream)', paddingTop: '24px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
            <div className="char-tabs">
              {characters.map((char, i) => (
                <div
                  key={char.id || i}
                  className={`char-tab${activeTab === i ? ' active' : ''}`}
                  onClick={() => setActiveTab(i)}
                >
                  {char.name}
                </div>
              ))}
              <div
                className="char-tab"
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: 'var(--orange)',
                  color: '#fff',
                  borderColor: 'var(--orange)',
                }}
              >
                + Add
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="char-name" style={{ marginBottom: 0 }}>
                {activeChar ? activeChar.name : 'NO CHARACTER SELECTED'}
              </div>
              {activeChar && (
                <button 
                  className="btn-outline-small" 
                  onClick={() => handleRemoveCharacter(activeTab)}
                  style={{ 
                    color: 'var(--orange)', 
                    borderColor: 'var(--orange)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px' 
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="char-images" id="charGrid">
            {activeChar?.images?.length > 0 ? (
              activeChar.images.map((img, i) => (
                <div key={i} className="char-img-thumb">
                  <img src={img} alt="Generated" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))
            ) : (
              charColors.map((color, i) => (
                <div
                  key={i}
                  className="char-img-thumb"
                  style={{ background: color + '88' }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="card-title">Generate Character</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  CHARACTER NAME
                </label>
                <input 
                  type="text"
                  placeholder="e.g. REENA" 
                  value={newChar.name}
                  onChange={(e) => setNewChar({...newChar, name: e.target.value})}
                  style={{ width: '100%', padding: '12px', border: '2px solid var(--border)', borderRadius: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  DESCRIPTION
                </label>
                <textarea 
                  placeholder="Describe your character's look..." 
                  value={newChar.description}
                  onChange={(e) => setNewChar({...newChar, description: e.target.value})}
                  style={{ 
                    width: '100%', 
                    minHeight: '100px', 
                    padding: '12px 16px', 
                    border: '2px solid var(--border)', 
                    borderRadius: '12px', 
                    fontFamily: 'var(--font-body)', 
                    fontSize: '14px', 
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
              </div>

              <button 
                className="btn-orange" 
                style={{ width: '100%' }}
                onClick={handleAddCharacter}
              >
                Create Character
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="auth-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowHistoryModal(false)}>×</button>
            <div className="card-title">Character History</div>
            {/* ... history content ... */}
          </div>
        </div>
      )}
    </div>
  );
}

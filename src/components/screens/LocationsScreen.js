'use client';

import { useState } from 'react';

const locationColors = [
  '#6B8E23', '#556B2F', '#808000', '#BDB76B',
  '#9ACD32', '#32CD32', '#228B22', '#006400',
  '#4A5D23', '#2E8B57', '#3CB371', '#8F9779',
];

export default function LocationsScreen({ onNavigate, projectData = [], onDataUpdate }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Local state for new location being created
  const [newLoc, setNewLoc] = useState({ name: '', description: '' });

  const locations = projectData || [];

  const handleAddLocation = async () => {
    if (!newLoc.name) return alert("Please enter a location name");

    const updatedLocs = [...locations, {
      id: Date.now(),
      name: newLoc.name.toUpperCase(),
      description: newLoc.description,
      images: []
    }];

    await onDataUpdate({ locations: updatedLocs });
    setShowCreateModal(false);
    setNewLoc({ name: '', description: '' });
    setActiveTab(updatedLocs.length - 1);
  };

  const handleRemoveLocation = async (index) => {
    const updatedLocs = locations.filter((_, i) => i !== index);
    await onDataUpdate({ locations: updatedLocs });
    if (activeTab >= updatedLocs.length) {
      setActiveTab(Math.max(0, updatedLocs.length - 1));
    }
  };

  const activeLoc = locations[activeTab] || null;

  return (
    <div className="screen active" id="s4">

      <div className="char-layout">
        {/* Left Panel */}
        <div className="char-panel">
          <div className="notif-card">
            <div className="notif-title">Notification</div>
            <div className="notif-big">Almost there!</div>
            <div className="notif-body">
              Characters are looking great. Let&apos;s build some locations for
              them to perform in!
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
              <button className="btn-teal" onClick={() => setShowCreateModal(true)}>
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Location Sheet */}
        <div className="char-sheet">
          <div style={{ position: 'sticky', top: '64px', zIndex: 10, background: 'var(--cream)', paddingTop: '24px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
            <div className="char-tabs">
              {locations.map((loc, i) => (
                <div
                  key={loc.id || i}
                  className={`char-tab${activeTab === i ? ' active' : ''}`}
                  onClick={() => setActiveTab(i)}
                >
                  {loc.name}
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
                {activeLoc ? activeLoc.name : 'NO LOCATION SELECTED'}
              </div>
              {activeLoc && (
                <button 
                  className="btn-outline-small" 
                  onClick={() => handleRemoveLocation(activeTab)}
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

          <div className="char-images" id="locGrid">
            {activeLoc?.images?.length > 0 ? (
              activeLoc.images.map((img, i) => (
                <div key={i} className="char-img-thumb">
                  <img src={img} alt="Generated" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))
            ) : (
              locationColors.map((color, i) => (
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
            <div className="card-title">Create Location</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
              
              {/* Image Placeholder */}
              <div style={{ 
                width: '100%', 
                aspectRatio: '16/9', 
                background: 'rgba(42, 38, 34, 0.05)', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: '#888', 
                fontSize: '14px', 
                border: '2px dashed var(--dark)' 
              }}>
                Generated Preview Will Appear Here
              </div>

              {/* Location Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  LOCATION NAME
                </label>
                <input 
                  type="text"
                  placeholder="e.g. ROOFTOP BAR" 
                  value={newLoc.name}
                  onChange={(e) => setNewLoc({...newLoc, name: e.target.value})}
                  style={{ width: '100%', padding: '12px', border: '2px solid var(--border)', borderRadius: '12px', fontFamily: 'var(--font-body)', fontSize: '14px', outline: 'none' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {/* Prompt Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  DESCRIPTION / PROMPT
                </label>
                <textarea 
                  placeholder="Describe your location here..." 
                  value={newLoc.description}
                  onChange={(e) => setNewLoc({...newLoc, description: e.target.value})}
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
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {/* Reference Image Upload */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(42, 38, 34, 0.03)', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  REFERENCE IMAGE
                </label>
                <button
                  className="btn-outline-small"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Upload File
                </button>
              </div>

              <button className="btn-orange" style={{ width: '100%' }} onClick={handleAddLocation}>
                Create Location
              </button>

            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="auth-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowHistoryModal(false)}>×</button>
            <div className="card-title">Location History</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '20px' }}>
              
              {/* This Project Section */}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', marginBottom: '12px', color: 'var(--dark)' }}>LOCATIONS IN THIS PROJECT</h3>
                {locations.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {locations.map((loc, i) => (
                      <div 
                        key={loc.id || i}
                        style={{ 
                          aspectRatio: '16/9', 
                          background: locationColors[i % locationColors.length], 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          border: '2px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                        }} 
                        className="history-item"
                        onClick={() => { setActiveTab(i); setShowHistoryModal(false); }}
                      >
                        {loc.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#888' }}>No locations created yet in this project.</div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

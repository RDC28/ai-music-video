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

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--border-mid)',
    borderRadius: '8px',
    background: 'var(--surface)',
    color: 'var(--dark)',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  };

  return (
    <div className="screen active" id="s4">

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
            Set Your Locations
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Define the places where your music video scenes will take place
          </p>
        </div>
        <button className="btn-teal" onClick={() => onNavigate(6)} style={{ fontSize: '12px', flexShrink: 0 }}>
          Continue to Shot List →
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left Panel */}
        <div style={{
          width: '256px',
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 20px',
          gap: '20px',
          overflowY: 'auto',
        }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
              Location Studio
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {locations.length > 0
                ? `${locations.length} location${locations.length !== 1 ? 's' : ''} defined`
                : 'No locations yet — add your first one below'}
            </div>
          </div>

          {locations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {locations.map((loc, i) => (
                <div
                  key={loc.id || i}
                  onClick={() => setActiveTab(i)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: activeTab === i ? 'rgba(0,184,212,0.1)' : 'transparent',
                    border: `1px solid ${activeTab === i ? 'rgba(0,184,212,0.25)' : 'transparent'}`,
                    color: activeTab === i ? 'var(--teal)' : 'var(--dark)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    letterSpacing: '0.02em',
                  }}
                >
                  {loc.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
            <button className="btn-orange" onClick={() => setShowCreateModal(true)} style={{ fontSize: '12px' }}>
              + Add Location
            </button>
            <button className="btn-outline" onClick={() => setShowHistoryModal(true)} style={{ fontSize: '12px' }}>
              Location History
            </button>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Tabs row */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
            {locations.map((loc, i) => (
              <div
                key={loc.id || i}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  background: activeTab === i ? 'rgba(0,184,212,0.12)' : 'transparent',
                  border: `1px solid ${activeTab === i ? 'rgba(0,184,212,0.3)' : 'var(--border)'}`,
                  color: activeTab === i ? 'var(--teal)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-display)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  letterSpacing: '0.02em',
                }}
              >
                {loc.name}
              </div>
            ))}
            <div
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                background: 'rgba(0,229,255,0.06)',
                border: '1px solid rgba(0,229,255,0.15)',
                color: 'var(--orange)',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              + Add
            </div>
          </div>

          {activeLoc ? (
            <>
              {/* Active location header */}
              <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em' }}>
                    {activeLoc.name}
                  </div>
                  {activeLoc.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {activeLoc.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveLocation(activeTab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,80,80,0.2)',
                    background: 'transparent',
                    color: '#FF5050',
                    fontSize: '11px',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,80,80,0.08)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Remove
                </button>
              </div>

              {/* Image grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
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
                        style={{ background: color + '44', border: '1px solid rgba(255,255,255,0.05)' }}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, color: 'var(--dark)' }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark)', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>No location selected</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Add your first location to get started</div>
              </div>
              <button className="btn-orange" onClick={() => setShowCreateModal(true)} style={{ fontSize: '12px' }}>
                + Add Location
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--dark)', marginBottom: '20px' }}>
              New Location
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Preview placeholder */}
              <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: 'var(--surface)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                border: '1px solid var(--border-mid)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, color: 'var(--dark)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Generated preview will appear here</span>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  Location Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rooftop Bar"
                  value={newLoc.name}
                  onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  Description
                </label>
                <textarea
                  placeholder="Describe the location — mood, lighting, setting..."
                  value={newLoc.description}
                  onChange={(e) => setNewLoc({ ...newLoc, description: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', fontFamily: 'var(--font-display)' }}>Reference Image</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>Optional — helps guide AI generation</div>
                </div>
                <button
                  className="btn-outline"
                  style={{ fontSize: '11px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload
                </button>
              </div>

              <button className="btn-orange" style={{ width: '100%' }} onClick={handleAddLocation}>
                Create Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="auth-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '560px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowHistoryModal(false)}>×</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--dark)', marginBottom: '20px' }}>
              Location History
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontFamily: 'var(--font-display)' }}>
                  In This Project ({locations.length})
                </div>
                {locations.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {locations.map((loc, i) => (
                      <div
                        key={loc.id || i}
                        onClick={() => { setActiveTab(i); setShowHistoryModal(false); }}
                        style={{
                          aspectRatio: '16/9',
                          background: locationColors[i % locationColors.length] + '55',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--dark)',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          fontFamily: 'var(--font-display)',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(0,184,212,0.4)'}
                        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        {loc.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center', background: 'var(--surface)', borderRadius: '8px' }}>
                    No locations created yet in this project.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

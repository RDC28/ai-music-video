'use client';

import { useState } from 'react';

const locationColors = [
  '#6B8E23', '#556B2F', '#808000', '#BDB76B',
  '#9ACD32', '#32CD32', '#228B22', '#006400',
  '#4A5D23', '#2E8B57', '#3CB371', '#8F9779',
];

export default function LocationsScreen({ onNavigate }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const handleTabClick = (index) => {
    setActiveTab(index);
  };

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
              <button className="btn-teal" onClick={() => onNavigate(6)}>
                Upload
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Location Sheet */}
        <div className="char-sheet">
          <div style={{ position: 'sticky', top: '64px', zIndex: 10, background: 'var(--cream)', paddingTop: '24px', paddingBottom: '12px', borderBottom: '2px solid var(--border)', marginBottom: '16px' }}>
            <div className="char-tabs">
              <div
                className={`char-tab${activeTab === 0 ? ' active' : ''}`}
                onClick={() => handleTabClick(0)}
              >
                LOCATION 1 — CAFE
              </div>
              <div
                className={`char-tab${activeTab === 1 ? ' active' : ''}`}
                onClick={() => handleTabClick(1)}
              >
                LOCATION 2 — PARK
              </div>
              <div
                className="char-tab"
                onClick={() => onNavigate(6)}
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
                {activeTab === 0 ? 'LOCATION 1 — CAFE' : 'LOCATION 2 — PARK'}
              </div>
              <button 
                className="btn-outline-small" 
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
            </div>
          </div>

          <div className="char-images" id="locGrid">
            {locationColors.map((color, i) => (
              <div
                key={i}
                className="char-img-thumb"
                style={{ background: color + '88' }}
              />
            ))}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="card-title">Generate Location</div>
            
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

              {/* Model Selection */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  AI MODEL
                </label>
                <button
                  className="btn-outline-small"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  Nano Banan Pro <span style={{ fontSize: '10px' }}>▼</span>
                </button>
              </div>

              {/* Prompt Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>
                  PROMPT
                </label>
                <textarea 
                  placeholder="Describe your location here..." 
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

              <button className="btn-orange" style={{ width: '100%' }}>
                Generate
              </button>

            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="auth-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '700px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowHistoryModal(false)}>×</button>
            <div className="card-title">Location History</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '20px' }}>
              
              {/* This Project Section */}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', marginBottom: '12px', color: 'var(--dark)' }}>GENERATED IN THIS PROJECT</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div style={{ aspectRatio: '16/9', background: '#3CB371', borderRadius: '8px', cursor: 'pointer', border: '2px solid transparent' }} className="history-item"></div>
                  <div style={{ aspectRatio: '16/9', background: '#228B22', borderRadius: '8px', cursor: 'pointer', border: '2px solid transparent' }} className="history-item"></div>
                </div>
              </div>

              {/* All Time Section */}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', marginBottom: '12px', color: 'var(--dark)' }}>ALL TIME GENERATIONS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                  {locationColors.map((color, i) => (
                    <div key={i} style={{ aspectRatio: '16/9', background: color, borderRadius: '8px', cursor: 'pointer', border: '2px solid transparent' }} className="history-item"></div>
                  ))}
                  {locationColors.map((color, i) => (
                    <div key={i + 12} style={{ aspectRatio: '16/9', background: color, borderRadius: '8px', cursor: 'pointer', border: '2px solid transparent', opacity: 0.8 }} className="history-item"></div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

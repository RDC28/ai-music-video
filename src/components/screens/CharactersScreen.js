'use client';

import { useState } from 'react';
import TopBar from '../TopBar';

const charColors = [
  '#8B6F47', '#A0522D', '#6B4423', '#4A3728',
  '#C4956A', '#7D5A3C', '#593D2B', '#8B7355',
  '#6E5040', '#4E342E', '#3E2723', '#795548',
];

export default function CharactersScreen({ onNavigate }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabClick = (index) => {
    setActiveTab(index);
  };

  return (
    <div className="screen active" id="s4">
      <TopBar left="PRATEEK" right="2025" />

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

          <div className="char-grid-btn-row">
            <button className="btn-outline">Let&apos;s create</button>
            <button
              className="btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Nano Banan Pro{' '}
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
          </div>

          <div className="char-grid-btn-row">
            <button className="btn-teal">From History</button>
            <button className="btn-teal" onClick={() => onNavigate(5)}>
              Upload
            </button>
          </div>
        </div>

        {/* Right Panel — Character Sheet */}
        <div className="char-sheet">
          <div className="char-tabs">
            <div
              className={`char-tab${activeTab === 0 ? ' active' : ''}`}
              onClick={() => handleTabClick(0)}
            >
              CHARACTER 1 — REENA
            </div>
            <div
              className={`char-tab${activeTab === 1 ? ' active' : ''}`}
              onClick={() => handleTabClick(1)}
            >
              CHARACTER 2 — RAVI
            </div>
            <div
              className="char-tab"
              onClick={() => onNavigate(5)}
              style={{
                background: 'var(--orange)',
                color: '#fff',
                borderColor: 'var(--orange)',
              }}
            >
              + Add
            </div>
          </div>

          <div className="char-name">
            {activeTab === 0 ? 'CHARACTER 1 — REENA' : 'CHARACTER 2 — RAVI'}
          </div>

          <div className="char-images" id="charGrid">
            {charColors.map((color, i) => (
              <div
                key={i}
                className="char-img-thumb"
                style={{ background: color + '88' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

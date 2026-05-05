import { useState } from 'react';
import Link from 'next/link';

export default function TopBar({ activeScreen, onNavigate, userName, projectName }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const steps = [
    { id: 1, name: 'Home' },
    { id: 2, name: 'Audio' },
    { id: 3, name: 'Script' },
    { id: 4, name: 'Chars' },
    { id: 5, name: 'Locs' },
    { id: 6, name: 'Shotlist' },
    { id: 7, name: 'Shots' },
    { id: 8, name: 'Images' },
    { id: 9, name: 'Videos' },
    { id: 10, name: 'Editor' },
  ];

  return (
    <div className="topbar-wrapper">
      <div className="topbar">

        {/* Left: Project name / user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span className="topbar-name">{projectName || 'Untitled Project'}</span>
          {userName && (
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.04)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              letterSpacing: '0.04em'
            }}>
              {userName}
            </span>
          )}
        </div>

        {/* Center: Step navigation (desktop) */}
        <div className="topbar-nav desktop-only">
          {steps.map(step => (
            <div
              key={step.id}
              onClick={() => onNavigate && onNavigate(step.id)}
              className={`topbar-step ${activeScreen === step.id ? 'active' : ''}`}
            >
              <span style={{ opacity: 0.4, marginRight: '3px', fontSize: '9px' }}>{step.id}.</span>
              {step.name}
            </div>
          ))}
        </div>

        {/* Mobile: Dropdown */}
        <div className="mobile-only" style={{ position: 'relative' }}>
          <button
            className="btn-outline"
            style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '6px' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {steps.find(s => s.id === activeScreen)?.name || 'Menu'}
            <span style={{ marginLeft: '4px', opacity: 0.5 }}>▾</span>
          </button>

          {mobileMenuOpen && (
            <div className="dropdown-menu" style={{ top: 'calc(100% + 8px)', right: 0, width: '160px' }}>
              {steps.map(step => (
                <div
                  key={step.id}
                  className="dropdown-item"
                  style={activeScreen === step.id ? {
                    backgroundColor: 'rgba(0, 229, 255, 0.08)',
                    color: 'var(--orange)'
                  } : {}}
                  onClick={() => {
                    onNavigate && onNavigate(step.id);
                    setMobileMenuOpen(false);
                  }}
                >
                  <span style={{ opacity: 0.4, marginRight: '6px', fontSize: '10px' }}>{step.id}.</span>
                  {step.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <span className="topbar-right desktop-only">
            Step {activeScreen} of {steps.length}
          </span>
          <Link href="/dashboard" className="btn-outline-small">
            Save &amp; Exit
          </Link>
        </div>

      </div>
    </div>
  );
}

import { useState } from 'react';
import Link from 'next/link';

export default function TopBar({ activeScreen, onNavigate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const rightText = activeScreen === 1 ? '12.03.2026' : (activeScreen <= 5 ? '2025' : 'MUSIC VIDEO');

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
      <span className="topbar-name">PRATEEK</span>
      
      {/* Desktop Nav */}
      <div className="topbar-nav desktop-only">
        {steps.map(step => (
          <div 
            key={step.id}
            onClick={() => onNavigate && onNavigate(step.id)}
            className={`topbar-step ${activeScreen === step.id ? 'active' : ''}`}
          >
            {step.name}
          </div>
        ))}
      </div>

      {/* Mobile Toggle */}
      <div className="mobile-only" style={{ position: 'relative' }}>
        <button 
          className="btn-orange" 
          style={{ padding: '6px 12px', fontSize: '11px' }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {steps.find(s => s.id === activeScreen)?.name || 'Menu'} ▾
        </button>
        
        {mobileMenuOpen && (
          <div className="dropdown-menu" style={{ top: '100%', right: 0, marginTop: '10px', width: '160px' }}>
            {steps.map(step => (
              <div 
                key={step.id}
                className={`dropdown-item ${activeScreen === step.id ? 'active' : ''}`}
                style={activeScreen === step.id ? { backgroundColor: 'rgba(61, 140, 122, 0.1)', color: 'var(--teal)', fontWeight: 700 } : {}}
                onClick={() => {
                  onNavigate && onNavigate(step.id);
                  setMobileMenuOpen(false);
                }}
              >
                {step.name}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span className="topbar-right desktop-only">{rightText}</span>
        <Link href="/dashboard" className="btn-outline-small">
          Save & Exit
        </Link>
      </div>
    </div>
    </div>
  );
}

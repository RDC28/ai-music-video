'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronDown, LayoutDashboard } from 'lucide-react';

export default function TopBar({ activeScreen, onNavigate, userName, projectName }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const steps = useMemo(() => [
    { id: 1, name: 'Home' },
    { id: 2, name: 'Audio' },
    { id: 3, name: 'Story' },
    { id: 4, name: 'Cast' },
    { id: 5, name: 'Sets' },
    { id: 6, name: 'Plan' },
    { id: 7, name: 'Shots' },
    { id: 8, name: 'Frames' },
    { id: 9, name: 'Clips' },
    { id: 10, name: 'Editor' },
  ], []);

  const activeStep = steps.find(step => step.id === activeScreen) || steps[0];
  const progress = Math.max(0, Math.min(100, ((activeScreen - 1) / (steps.length - 1)) * 100));
  const canGoBack = activeScreen > 1;
  const canGoForward = activeScreen < steps.length;

  return (
    <div className="topbar-wrapper">
      <div className="topbar">
        <div className="topbar-left">
          <Link href="/dashboard" className="topbar-dashboard" aria-label="Back to dashboard">
            <LayoutDashboard size={15} />
          </Link>
          <div className="topbar-project">
            <span className="topbar-name">{projectName || 'Untitled project'}</span>
            <span className="topbar-current">
              {String(activeStep.id).padStart(2, '0')} / {activeStep.name}
            </span>
          </div>
          {userName && (
            <span className="topbar-user">
              {userName}
            </span>
          )}
        </div>

        <div className="topbar-nav desktop-only">
          {steps.map(step => (
            <button
              key={step.id}
              type="button"
              onClick={() => onNavigate && onNavigate(step.id)}
              className={`topbar-step ${activeScreen === step.id ? 'active' : ''}`}
              aria-current={activeScreen === step.id ? 'step' : undefined}
            >
              <span className="topbar-step-index">{String(step.id).padStart(2, '0')}</span>
              {step.name}
            </button>
          ))}
          <div className="topbar-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mobile-only topbar-mobile-menu">
          <button
            className="btn-outline"
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {activeStep.name}
            <ChevronDown size={13} />
          </button>

          {mobileMenuOpen && (
            <div className="dropdown-menu">
              {steps.map(step => (
                <div
                  key={step.id}
                  className={`dropdown-item ${activeScreen === step.id ? 'active' : ''}`}
                  onClick={() => {
                    onNavigate && onNavigate(step.id);
                    setMobileMenuOpen(false);
                  }}
                >
                  <span className="topbar-step-index">{String(step.id).padStart(2, '0')}</span>
                  {step.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-icon-btn desktop-only"
            onClick={() => canGoBack && onNavigate(activeScreen - 1)}
            disabled={!canGoBack}
            aria-label="Previous step"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            className="topbar-icon-btn desktop-only"
            onClick={() => canGoForward && onNavigate(activeScreen + 1)}
            disabled={!canGoForward}
            aria-label="Next step"
          >
            <ArrowRight size={14} />
          </button>
          <Link href="/dashboard" className="btn-outline-small">
            Save &amp; Exit
          </Link>
        </div>

      </div>
    </div>
  );
}

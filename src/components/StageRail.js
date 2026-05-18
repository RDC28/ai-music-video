'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Home, Music2, BookOpen, Users, MapPin, Film,
  Layers, Video, Scissors, Shirt,
  Check, ChevronLeft, ChevronRight,
} from 'lucide-react';

const STEPS = [
  { id: 1,  name: 'Home',   icon: Home },
  { id: 2,  name: 'Audio',  icon: Music2 },
  { id: 3,  name: 'Story',  icon: BookOpen },
  { id: 4,  name: 'Cast',   icon: Users },
  { id: 5,  name: 'Sets',   icon: MapPin },
  { id: 6,  name: 'Looks',  icon: Shirt },
  { id: 7,  name: 'Plan',   icon: Film },
  { id: 8,  name: 'Shots',  icon: Layers },
  { id: 9,  name: 'Clips',  icon: Video },
  { id: 10, name: 'Editor', icon: Scissors },
];

export default function StageRail({ activeScreen, onNavigate, userName, projectName }) {
  const activeStep  = useMemo(() => STEPS.find(s => s.id === activeScreen) || STEPS[0], [activeScreen]);
  const canGoBack    = activeScreen > 1;
  const canGoForward = activeScreen < STEPS.length;

  return (
    <>
      {/* ── Left rail ── */}
      <nav className="stage-rail" aria-label="Production steps">
        <div className="stage-rail-logo">
          <div className="stage-rail-logo-mark" aria-hidden="true">A</div>
          <span className="stage-rail-project" title={projectName}>
            {projectName || 'Untitled'}
          </span>
        </div>

        <div className="stage-rail-steps">
          {STEPS.map((step) => {
            const isActive    = activeScreen === step.id;
            const isCompleted = step.id < activeScreen;
            const Icon        = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                className={`stage-rail-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                onClick={() => onNavigate?.(step.id)}
                aria-current={isActive ? 'step' : undefined}
                title={step.name}
              >
                <div className="stage-rail-step-main" aria-hidden="true">
                  <span className="stage-rail-step-num">
                    {String(step.id).padStart(2, '0')}
                  </span>
                  <Icon size={14} className="stage-rail-step-icon" />
                  <span className="stage-rail-step-name">{step.name}</span>
                </div>

                <div className="stage-rail-step-dot" aria-hidden="true">
                  {isCompleted && (
                    <Check size={8} strokeWidth={2.5} color="var(--success)" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Top strip ── */}
      <div className="workflow-topstrip">
        <div className="topstrip-left">
          <div className="topstrip-project">{projectName || 'Untitled project'}</div>
          {userName && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-soft)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {userName}
            </span>
          )}
        </div>
        <div className="topstrip-right">
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => canGoBack && onNavigate?.(activeScreen - 1)}
            disabled={!canGoBack}
            aria-label="Previous step"
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-soft)',
            letterSpacing: '0.04em',
            minWidth: '36px',
            textAlign: 'center',
          }}>
            {String(activeScreen).padStart(2, '0')}&thinsp;/&thinsp;{String(STEPS.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => canGoForward && onNavigate?.(activeScreen + 1)}
            disabled={!canGoForward}
            aria-label="Next step"
          >
            <ChevronRight size={14} />
          </button>
          <Link href="/dashboard" className="btn-outline-small">
            Exit
          </Link>
        </div>
      </div>

      {/* ── Mobile strip ── */}
      <div className="stage-rail-mobile" role="navigation" aria-label="Step navigation">
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={() => canGoBack && onNavigate?.(activeScreen - 1)}
          disabled={!canGoBack}
          aria-label="Previous step"
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="stage-rail-mobile-num">
            {String(activeScreen).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </div>
          <div className="stage-rail-mobile-label">{activeStep.name}</div>
        </div>
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={() => canGoForward && onNavigate?.(activeScreen + 1)}
          disabled={!canGoForward}
          aria-label="Next step"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

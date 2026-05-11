'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Home, Music2, BookOpen, Users, MapPin, Film,
  Layers, Image, Video, Scissors,
  CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';

const STEPS = [
  { id: 1,  name: 'Home',   icon: Home },
  { id: 2,  name: 'Audio',  icon: Music2 },
  { id: 3,  name: 'Story',  icon: BookOpen },
  { id: 4,  name: 'Cast',   icon: Users },
  { id: 5,  name: 'Sets',   icon: MapPin },
  { id: 6,  name: 'Plan',   icon: Film },
  { id: 7,  name: 'Shots',  icon: Layers },
  { id: 8,  name: 'Frames', icon: Image },
  { id: 9,  name: 'Clips',  icon: Video },
  { id: 10, name: 'Editor', icon: Scissors },
];

export default function StageRail({ activeScreen, onNavigate, userName, projectName }) {
  const activeStep = useMemo(() => STEPS.find(s => s.id === activeScreen) || STEPS[0], [activeScreen]);
  const canGoBack    = activeScreen > 1;
  const canGoForward = activeScreen < STEPS.length;

  return (
    <>
      {/* ── Left rail (grid col 1, all rows) ── */}
      <nav className="stage-rail" aria-label="Production steps">
        {/* Logo + project name */}
        <div className="stage-rail-logo">
          <div className="stage-rail-logo-mark" aria-hidden="true">A</div>
          <span className="stage-rail-project" title={projectName}>
            {projectName || 'Untitled'}
          </span>
        </div>

        {/* Step list */}
        <div className="stage-rail-steps">
          {STEPS.map((step) => {
            const isActive    = activeScreen === step.id;
            const isCompleted = step.id < activeScreen;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                className={`stage-rail-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                onClick={() => onNavigate && onNavigate(step.id)}
                aria-current={isActive ? 'step' : undefined}
                title={step.name}
              >
                <div className="stage-rail-step-dot" aria-hidden="true">
                  {isCompleted
                    ? <CheckCircle2 size={12} color="var(--amber)" strokeWidth={2} />
                    : isActive
                      ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'block' }} />
                      : null
                  }
                </div>
                {/* Number shows only when collapsed (via z-index trick replaced by opacity) */}
                <span className="stage-rail-step-num" aria-hidden="true">
                  {String(step.id).padStart(2, '0')}
                </span>
                <Icon size={15} className="stage-rail-step-icon" aria-hidden="true" />
                <span className="stage-rail-step-name">{step.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Top strip (grid col 2, row 1) ── */}
      <div className="workflow-topstrip">
        <div className="topstrip-left">
          <div className="topstrip-project">{projectName || 'Untitled project'}</div>
          {userName && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-muted)',
              letterSpacing: '0.1em',
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
            onClick={() => canGoBack && onNavigate(activeScreen - 1)}
            disabled={!canGoBack}
            aria-label="Previous step"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => canGoForward && onNavigate(activeScreen + 1)}
            disabled={!canGoForward}
            aria-label="Next step"
          >
            <ChevronRight size={15} />
          </button>
          <Link href="/dashboard" className="btn-outline-small">
            Save &amp; Exit
          </Link>
        </div>
      </div>

      {/* ── Mobile bottom strip ── */}
      <div className="stage-rail-mobile" role="navigation" aria-label="Step navigation">
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={() => canGoBack && onNavigate(activeScreen - 1)}
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
          onClick={() => canGoForward && onNavigate(activeScreen + 1)}
          disabled={!canGoForward}
          aria-label="Next step"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

'use client';

import { useRef } from 'react';
import { ArrowRight, Image, Music2, Scissors, Wand2 } from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

const homeActions = [
  {
    id: 'music-video',
    num: '01',
    title: 'Music Video',
    copy: 'Available now. End-to-end workflow for music-video production.',
    step: 2,
    available: true,
    icon: Music2,
  },
  {
    id: 'short',
    num: '02',
    title: 'Short',
    copy: 'Coming soon. Narrative short-format mode.',
    step: null,
    available: false,
    icon: Wand2,
  },
  {
    id: 'movie',
    num: '03',
    title: 'Movie',
    copy: 'Coming soon. Long-form film mode.',
    step: null,
    available: false,
    icon: Image,
  },
  {
    id: 'tv-series',
    num: '04',
    title: 'TV Series',
    copy: 'Coming soon. Episodic multi-part production mode.',
    step: null,
    available: false,
    icon: Scissors,
  },
];

export default function LandingScreen({ onNavigate, userName }) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef(null);
  const primaryAction = homeActions[0];
  const upcomingActions = homeActions.slice(1);

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });
  const bgX = useTransform(springX, [0, 1], shouldReduceMotion ? [0, 0] : [-14, 14]);
  const bgY = useTransform(springY, [0, 1], shouldReduceMotion ? [0, 0] : [-10, 10]);

  const handleMouseMove = (e) => {
    if (shouldReduceMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  return (
    <div
      className="screen active screen-fill"
      id="s1"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Parallax background depth layer */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '-1.875rem',
          pointerEvents: 'none',
          zIndex: 0,
          x: bgX,
          y: bgY,
          background: `radial-gradient(ellipse 60% 50% at 20% 30%, rgba(var(--cyan-rgb), 0.05), transparent 65%),
                       radial-gradient(ellipse 40% 40% at 85% 75%, rgba(var(--cyan-rgb), 0.04), transparent 65%)`,
        }}
      />

      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Quick Start"
        storageKey="workflow-three-pane:s1"
        minRightWidth={300}
        maxRightWidth={440}
        defaultRightWidth={360}
        main={(
          <div className="landing-home-main">
            <section className="landing-home-hero">
              <div className="screen-kicker" style={{ marginBottom: '1rem' }}>▪ Home · Ready</div>
              <h1 className="landing-center-title">
                Hello, <span>{userName || 'friend'}.</span>
              </h1>
              <p className="landing-center-copy">
                Music Video mode is ready now. Pick a format below and begin your workflow from Audio onward.
              </p>
              <button
                type="button"
                className="landing-center-cta"
                onClick={() => onNavigate(primaryAction.step)}
              >
                Open Music Video
                <ArrowRight size={17} />
              </button>
            </section>

            <section className="landing-home-grid">
              {homeActions.map(({ id, num, title, copy, icon: Icon, step, available }) => (
                <button
                  key={id}
                  type="button"
                  disabled={!available}
                  className={`landing-action-card landing-action-${id} ${available ? 'is-active' : 'is-disabled'}`}
                  onClick={() => {
                    if (!available || !step) return;
                    onNavigate(step);
                  }}
                >
                  <div className="landing-action-top">
                    <span className="panel-meta-label panel-meta-label--cyan" style={{ marginBottom: 0 }}>
                      {num}
                    </span>
                    <span className="landing-action-icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                  </div>
                  <div className="landing-action-title">{title}</div>
                  <p className="landing-action-copy">{copy}</p>
                  <span className={`landing-action-foot ${available ? '' : 'is-disabled'}`}>
                    {available ? (
                      <>
                        Start now
                        <ArrowRight size={15} />
                      </>
                    ) : (
                      'Coming soon'
                    )}
                  </span>
                </button>
              ))}
            </section>
          </div>
        )}
        right={(
          <div className="landing-home-right">
            <div className="panel-flat">
              <div className="panel-meta-label">Active Format</div>
              <div className="landing-quick-title">{primaryAction.title}</div>
              <p className="body-sm">{primaryAction.copy}</p>
              <button
                type="button"
                className="btn-orange"
                style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
                onClick={() => onNavigate(primaryAction.step)}
              >
                Continue to Audio
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="panel-flat">
              <div className="panel-meta-label">Roadmap</div>
              <div className="landing-roadmap-list">
                {upcomingActions.map((item) => (
                  <div key={item.id} className="landing-roadmap-item">
                    <span className="landing-roadmap-num">{item.num}</span>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-flat" style={{ marginTop: 'auto' }}>
              <div className="panel-meta-label">Hint</div>
              <p className="body-sm">Use StageRail on the left anytime to jump between steps once data is ready.</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}

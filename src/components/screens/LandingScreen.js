'use client';

import { useRef } from 'react';
import { ArrowRight, Film, Image, Music2, Wand2, Scissors } from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { quotes } from '@/data/quotes';

const workflowSteps = [
  { num: '01', title: 'Track',    copy: 'Upload your song. The studio reads rhythm, lyrics, and mood.', icon: Music2 },
  { num: '02', title: 'Plan',     copy: 'Turn your idea into script beats, cast, locations, and shots.',  icon: Wand2  },
  { num: '03', title: 'Generate', copy: 'Build approved frames into video clips without losing context.', icon: Image  },
  { num: '04', title: 'Assemble', copy: 'Finish in the timeline with audio-aware trimming and export.',   icon: Scissors },
];

export default function LandingScreen({ onNavigate, userName }) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef(null);

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

  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div
      className="screen active"
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
          inset: '-30px',
          pointerEvents: 'none',
          zIndex: 0,
          x: bgX,
          y: bgY,
          background: `radial-gradient(ellipse 60% 50% at 20% 30%, rgba(103,232,249,0.05), transparent 65%),
                       radial-gradient(ellipse 40% 40% at 85% 75%, rgba(103,232,249,0.04), transparent 65%)`,
        }}
      />

      {/* Asymmetric grid: 56% / 44% */}
      <div className="grid-56-44">

        {/* ── Left column ── */}
        <section className="flex-col gap-20 min-h-0">

          {/* Greeting card */}
          <div className="hero-card">
            <div>
              <div className="screen-kicker" style={{ marginBottom: '20px' }}>▪ Welcome back</div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5.5vw, 64px)', fontWeight: '700', color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: '16px' }}>
                Hello,{' '}
                <span style={{ color: 'var(--cyan)' }}>{userName || 'friend'}.</span>
              </h1>
              <p className="body-sm" style={{ fontSize: '14px', maxWidth: '420px', lineHeight: 1.7 }}>
                Build a music video from the track outward — song insights, story, visual references, shots, clips, and final edit, all in one focused space.
              </p>
            </div>

            {/* Primary CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(2)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(2); } }}
              className="subtle-panel flex-between"
              style={{ gap: '16px', padding: '22px 24px', cursor: 'pointer', marginTop: '28px', transition: 'box-shadow 200ms ease-out, border-color 200ms ease-out', borderRadius: 'var(--radius-lg)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--neo-active)'; e.currentTarget.style.borderColor = 'var(--cyan-border)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--neo-flat)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div>
                <div className="screen-kicker" style={{ marginBottom: '6px' }}>▪ Begin · Step 01</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                  Start with the song
                </div>
                <div className="body-sm">Upload your track and move through the production flow at your pace.</div>
              </div>
              <div className="flex-center neo-flat" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0, color: 'var(--cyan)' }}>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Right column — starts 56px lower (asymmetric) ── */}
        <section className="flex-col gap-16 min-h-0" style={{ paddingTop: '56px' }}>
          {/* Workflow step cards in 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {workflowSteps.map(({ num, title, copy, icon: Icon }) => (
              <div key={title} className="panel-flat flex-col gap-10" style={{ padding: '18px' }}>
                <div className="flex-between">
                  <div className="icon-circle" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
                    <Icon size={15} />
                  </div>
                  <span className="panel-meta-label" style={{ marginBottom: 0 }}>{num}</span>
                </div>
                <div>
                  <div className="step-title">{title}</div>
                  <div className="step-copy">{copy}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quote */}
          {quote && (
            <div className="panel-flat flex-1" style={{ padding: '20px' }}>
              <div className="panel-meta-label" style={{ marginBottom: '14px' }}>▪ Creative signal</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: '500', color: 'var(--text-soft)', lineHeight: 1.6, letterSpacing: '-0.01em', paddingLeft: '16px', borderLeft: '2px solid var(--cyan-border)' }}>
                {quote.text}
                {quote.author && (
                  <div className="panel-meta-label" style={{ marginTop: '10px' }}>— {quote.author}</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

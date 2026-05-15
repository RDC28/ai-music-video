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
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'grid',
        gridTemplateColumns: '56fr 44fr',
        gap: '28px',
        padding: '32px 28px',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}>

        {/* ── Left column ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '24px', minHeight: 0 }}>

          {/* Greeting card */}
          <div style={{
            background: 'var(--surface-2)',
            boxShadow: 'var(--neo-raised)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border)',
            padding: '36px 32px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 0,
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--cyan)',
                marginBottom: '20px',
              }}>
                ▪ Welcome back
              </div>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(40px, 5.5vw, 64px)',
                fontWeight: '700',
                color: 'var(--text)',
                letterSpacing: '-0.03em',
                lineHeight: 1.0,
                marginBottom: '16px',
              }}>
                Hello,{' '}
                <span style={{ color: 'var(--cyan)' }}>
                  {userName || 'friend'}.
                </span>
              </h1>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--text-muted)',
                lineHeight: 1.7,
                maxWidth: '420px',
              }}>
                Build a music video from the track outward — song insights, story, visual references, shots, clips, and final edit, all in one focused space.
              </p>
            </div>

            {/* Primary CTA */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(2)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(2); } }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '22px 24px',
                background: 'var(--surface)',
                boxShadow: 'var(--neo-raised)',
                border: '1px solid var(--border-mid)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                marginTop: '28px',
                transition: 'box-shadow 200ms ease-out, border-color 200ms ease-out',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = 'var(--neo-active)';
                e.currentTarget.style.borderColor = 'var(--cyan-border)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'var(--neo-raised)';
                e.currentTarget.style.borderColor = 'var(--border-mid)';
              }}
            >
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: '700',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--cyan)',
                  marginBottom: '6px',
                }}>
                  ▪ Begin · Step 01
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '20px',
                  fontWeight: '700',
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                  marginBottom: '4px',
                }}>
                  Start with the song
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>
                  Upload your track and move through the production flow at your pace.
                </div>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--surface-2)',
                boxShadow: 'var(--neo-flat)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--cyan)',
              }}>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Right column — starts 56px lower (asymmetric) ── */}
        <section style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          paddingTop: '56px',
          minHeight: 0,
        }}>
          {/* Workflow step cards in 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {workflowSteps.map(({ num, title, copy, icon: Icon }) => (
              <div key={title} style={{
                background: 'var(--surface-2)',
                boxShadow: 'var(--neo-flat)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    boxShadow: 'var(--neo-raised)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--cyan)',
                  }}>
                    <Icon size={15} />
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.08em',
                  }}>
                    {num}
                  </span>
                </div>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: 'var(--text)',
                    letterSpacing: '-0.01em',
                    marginBottom: '4px',
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.55,
                  }}>
                    {copy}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quote */}
          {quote && (
            <div style={{
              background: 'var(--surface-2)',
              boxShadow: 'var(--neo-flat)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              flex: 1,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '14px',
              }}>
                ▪ Creative signal
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '15px',
                fontWeight: '500',
                color: 'var(--text-soft)',
                lineHeight: 1.6,
                letterSpacing: '-0.01em',
                position: 'relative',
                paddingLeft: '16px',
                borderLeft: '2px solid var(--cyan-border)',
              }}>
                {quote.text}
                {quote.author && (
                  <div style={{
                    marginTop: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}>
                    — {quote.author}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

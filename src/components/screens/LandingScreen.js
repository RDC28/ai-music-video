'use client';

import { useState } from 'react';
import { ArrowRight, Film, Image, Music2, Wand2 } from 'lucide-react';
import { quotes } from '@/data/quotes';

export default function LandingScreen({ onNavigate, userName }) {
  const [quoteIndex] = useState(() => Math.floor(Math.random() * quotes.length));
  const currentQuote = quotes[quoteIndex];

  const productionFormats = ['Single Release', 'Performance Cut', 'Narrative Edit'];
  const workflowCards = [
    { title: 'Track',    copy: 'Start with audio and let the studio read rhythm, lyrics, and mood.', icon: Music2, num: '01' },
    { title: 'Plan',     copy: 'Turn the idea into script beats, cast, locations, and timed shots.',  icon: Wand2,  num: '02' },
    { title: 'Generate', copy: 'Move from approved frames to video clips without losing context.',     icon: Image,  num: '03' },
    { title: 'Assemble', copy: 'Finish in the timeline with audio-aware trimming and export.',         icon: Film,   num: '04' },
  ];

  return (
    <div className="screen active" id="s1">
      <div className="landing-view">

        {/* ── Left context panel ── */}
        <section className="landing-primary premium-panel">
          <div>
            <div className="landing-eyebrow">── Welcome back</div>
            <h1 className="landing-title">
              Hello,<br/>
              <span style={{
                background: 'linear-gradient(135deg, var(--violet), var(--rose))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 4px 32px rgba(124,58,237,0.3))',
              }}>
                {userName || 'friend'}.
              </span>
            </h1>
            <p className="landing-copy">
              Build a music video from the track outward — song insights, story, visual references,
              shots, clips, and final edit, all in one focused space.
            </p>

            {/* Primary CTA card */}
            <div
              className="landing-cta"
              onClick={() => onNavigate(2)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(2); } }}
              role="button"
              tabIndex={0}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: '8px' }}>
                  ── Begin · Step 01
                </div>
                <div className="landing-cta-title">A Music Video</div>
                <div className="landing-cta-copy">
                  Start with the song. Move through the production flow at your pace.
                </div>
              </div>
              <div className="landing-cta-icon">
                <ArrowRight size={20} />
              </div>
            </div>
          </div>

          {/* "Coming soon" format chips */}
          <div className="landing-soon-row">
            {productionFormats.map(label => (
              <div key={label} className="landing-soon-card subtle-panel">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px', opacity: 0.8 }}>
                  Soon
                </div>
                <div className="landing-card-title">{label}</div>
                <div className="landing-card-copy">Studio-ready flow</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Right panel ── */}
        <section className="landing-secondary">
          <div className="landing-step-grid">
            {workflowCards.map(({ title, copy, icon: Icon, num }) => (
              <div key={title} className="landing-step-card premium-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="landing-step-icon">
                    <Icon size={18} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
                    {num}
                  </span>
                </div>
                <div>
                  <div className="landing-card-title">{title}</div>
                  <div className="landing-card-copy">{copy}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quote card */}
          <div className="quote-card premium-panel">
            <div className="panel-label" style={{ marginBottom: '14px', color: 'var(--violet)' }}>
              ── Creative signal
            </div>
            <div style={{ position: 'relative', paddingLeft: '14px' }}>
              <span aria-hidden style={{ position: 'absolute', left: 0, top: '-6px', fontSize: '32px', fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--violet)', lineHeight: 1, opacity: 0.6 }}>
                "
              </span>
              {currentQuote?.text}
              {currentQuote?.author && (
                <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontStyle: 'normal' }}>
                  — {currentQuote.author}
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

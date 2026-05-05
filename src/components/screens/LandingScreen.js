'use client';

import { useState, useEffect } from 'react';
import { quotes } from '@/data/quotes';

export default function LandingScreen({ onNavigate, userName }) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * quotes.length));
  }, []);

  const currentQuote = quotes[quoteIndex];

  const comingSoon = ['Short Film', 'Movie', 'TV Series'];

  return (
    <div className="screen active" id="s1">

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 40px',
        maxWidth: '720px',
        margin: '0 auto',
        width: '100%',
        gap: '0',
      }}>

        {/* Greeting */}
        <div style={{ marginBottom: '44px' }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--teal)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '12px',
            fontFamily: 'var(--font-display)',
          }}>
            Welcome back
          </div>
          <div className="hello-text" style={{ textAlign: 'left' }}>
            Hello, {userName || 'there'}.
          </div>
          <div className="hello-sub" style={{ textAlign: 'left' }}>
            What would you like to create today?
          </div>
        </div>

        {/* Music Video — Primary CTA */}
        <div
          onClick={() => onNavigate(2)}
          role="button"
          style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,184,212,0.04) 100%)',
            border: 'none',
            borderRadius: '14px',
            padding: '22px 24px',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            transition: 'box-shadow 0.2s, transform 0.2s',
            boxShadow: '0 0 0 1px rgba(0,229,255,0.2), 0 8px 32px rgba(0,229,255,0.08), inset 0 1px 0 rgba(0,229,255,0.14)',
            transform: 'translateY(0)',
          }}
          onMouseOver={e => {
            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(0,229,255,0.35), 0 16px 48px rgba(0,229,255,0.16), inset 0 1px 0 rgba(0,229,255,0.2)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(0,229,255,0.2), 0 8px 32px rgba(0,229,255,0.08), inset 0 1px 0 rgba(0,229,255,0.14)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--orange)',
              marginBottom: '5px',
              letterSpacing: '-0.01em',
            }}>
              Music Video
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(234,234,234,0.55)', lineHeight: 1.5 }}>
              Transform your music into a cinematic visual experience
            </div>
          </div>
          <div style={{
            flexShrink: 0,
            width: '34px',
            height: '34px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.18) 0%, rgba(0,184,212,0.1) 100%)',
            boxShadow: '0 0 0 1px rgba(0,229,255,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--orange)',
            fontSize: '16px',
            fontWeight: 300,
          }}>
            →
          </div>
        </div>

        {/* Coming Soon tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
          {comingSoon.map(label => (
            <div
              key={label}
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px',
                padding: '14px 18px',
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: 0.45,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'rgba(234,234,234,0.45)',
              }}>
                {label}
              </span>
              <span style={{
                fontSize: '8px',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(234,234,234,0.3)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                flexShrink: 0,
              }}>
                SOON
              </span>
            </div>
          ))}
        </div>

      </div>

      {/* Quote footer */}
      <div className="quote-bar">
        &ldquo;{currentQuote?.text}&rdquo;
        {currentQuote?.author && <span style={{ marginLeft: '6px', opacity: 0.6 }}>— {currentQuote.author}</span>}
      </div>

    </div>
  );
}

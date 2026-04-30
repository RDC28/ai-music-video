'use client';

import { useState, useEffect, useRef } from 'react';
import { quotes } from '@/data/quotes';

export default function LandingScreen({ onNavigate, userName }) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    // Pick a random starting quote on first load and keep it
    setQuoteIndex(Math.floor(Math.random() * quotes.length));
  }, []);

  const currentQuote = quotes[quoteIndex];

  return (
    <div className="screen active" id="s1">

      <div className="hero-grid">
        <div className="hero-col">
          <div className="tile tile-disabled" style={{ flex: 0.8 }}>
            <span className="tile-label">SHORT</span>
          </div>
          <div className="tile tile-disabled" style={{ flex: 1.2 }}>
            <span className="tile-label">TV SERIES</span>
          </div>
        </div>

        <div className="tile tile-center" style={{ height: '100%' }}>
          <div className="heart-icon">♥</div>
          <div className="hello-text">
            hello
            <br />
            <strong>{userName || 'PRATEEK'}!</strong>
          </div>
          <div className="hello-sub">
            Let&apos;s tell a tale.
          </div>
        </div>

        <div className="hero-col">
          <div className="tile tile-disabled" style={{ flex: 1.2 }}>
            <span className="tile-label">MOVIE</span>
          </div>
          <div
            className="tile tile-music"
            onClick={() => onNavigate(2)}
            style={{ flex: 0.8, cursor: 'pointer' }}
          >
            <span className="tile-label">MUSIC VIDEO</span>
          </div>
        </div>
      </div>

      <div className="quote-bar">
        {currentQuote.text}
        <br />
        -{currentQuote.author}
      </div>
    </div>
  );
}

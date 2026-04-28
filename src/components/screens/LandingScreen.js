'use client';

import { useState, useEffect, useRef } from 'react';
import TopBar from '../TopBar';
import { quotes } from '@/data/quotes';

export default function LandingScreen({ onNavigate }) {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    // Pick a random starting quote on first load and keep it
    setQuoteIndex(Math.floor(Math.random() * quotes.length));
  }, []);

  const currentQuote = quotes[quoteIndex];

  return (
    <div className="screen active" id="s1">
      <TopBar left="PRATEEK" right="12.03.2026" />

      <div className="hero-grid">
        <div className="tile tile-center">
          <div className="heart-icon">♥</div>
          <div className="hello-text">
            hello
            <br />
            <strong>PRATEEK!</strong>
          </div>
          <div className="hello-sub">
            Let&apos;s tell a tale.
          </div>
        </div>

        <div
          className="tile tile-music"
          onClick={() => onNavigate(2)}
          style={{ cursor: 'pointer' }}
        >
          <span className="tile-label">MUSIC VIDEO</span>
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { ArrowRight } from 'lucide-react';

export default function Home() {
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (isLogin) {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        router.push('/dashboard');
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: firstName } },
        });
        if (signUpError) throw signUpError;
        alert('Account created. Check your email to confirm access.');
        setIsLogin(true);
      }
    } catch {
      setError(isLogin
        ? 'Sign in failed. Check your email and password.'
        : 'Account could not be created. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const ticker = '  Track · Plan · Generate · Assemble · ';

  return (
    <div className="home-screen">
      <nav className="home-nav">
        <div className="home-logo">Aura</div>
        <div className="home-nav-links">
          <button
            onClick={() => { setIsLogin(true); setShowAuth(true); }}
            className="btn-outline"
            style={{ padding: '0.5rem 1.25rem', fontSize: '0.8125rem' }}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsLogin(false); setShowAuth(true); }}
            className="btn-primary"
            style={{ padding: '0.5625rem 1.25rem', fontSize: '0.8125rem' }}
          >
            Enter the Studio
          </button>
        </div>
      </nav>

      <main className="home-main">
        {/* Hero */}
        <section className="hero-section">
          <div className="hero-badge">AI Music Video Studio</div>

          <h1 className="hero-title">
            Turn a song<br/>
            into a <em>world.</em>
          </h1>

          <p className="hero-subtitle">
            Plan, generate, and assemble cinematic music videos with consistent characters,
            locations, and timing — in one focused workspace.
          </p>

          <div className="hero-actions">
            <button
              onClick={() => { setIsLogin(false); setShowAuth(true); }}
              className="btn-primary hero-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Enter the Studio
              <ArrowRight size={16} />
            </button>
            <a href="#flow" className="btn-outline hero-cta">
              See How It Works
            </a>
          </div>

          {/* Ticker */}
          <div className="hero-ticker" aria-hidden>
            <div className="hero-ticker-inner">
              {ticker.repeat(6)}{ticker.repeat(6)}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="flow" className="features-grid">
          <div className="feature-card">
            <div className="feature-icon teal-icon">✦</div>
            <h3>Story Planning</h3>
            <p>Start with a loose idea or lyrics, and shape it into scenes, beats, and a production-ready shot plan.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon orange-icon">✺</div>
            <h3>Consistent Worlds</h3>
            <p>Keep cast, styling, locations, and visual language aligned from first frame to final edit.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon dark-icon">▷</div>
            <h3>Final Assembly</h3>
            <p>Move from approved frames to clips, arrange the timeline, and prepare a polished export.</p>
          </div>
        </section>

        {/* Quote */}
        <section
          id="story"
          aria-label="Tagline"
          style={{
            maxWidth: '47.5rem',
            textAlign: 'center',
            padding: '3rem 2.5rem',
            position: 'relative',
            background: 'rgba(var(--ink-900-rgb), 0.7)',
            border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)',
            borderRadius: '1.5rem',
            backdropFilter: 'blur(1rem)',
            boxShadow: '0 0 5rem rgba(var(--violet-rgb), 0.08)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--cyan)',
              marginBottom: '1.25rem',
            }}
          >
            ── Why Aura
          </div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 'clamp(1.375rem, 3vw, 2.375rem)',
              fontWeight: 400,
              color: 'var(--text-soft)',
              lineHeight: 1.45,
              letterSpacing: '-0.02em',
            }}
          >
            &ldquo;We made a studio for the moment a song asks
            to <span style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>become a picture</span> —
            no dashboards, no jargon.&rdquo;
          </p>
        </section>
      </main>

      <footer className="home-footer">
        <span style={{ opacity: 0.7 }}>©</span>&nbsp;2026&nbsp;&nbsp;·&nbsp;&nbsp;AURA STUDIO&nbsp;&nbsp;·&nbsp;&nbsp;ALL RIGHTS RESERVED
      </footer>

      {/* Auth modal */}
      {showAuth && (
        <div className="auth-overlay" onClick={() => setShowAuth(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowAuth(false)} aria-label="Close">×</button>

            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.75rem', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.025em', marginBottom: '1.25rem' }}>
              Aura
            </div>

            <div className="auth-header">
              <h2 className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>Sign in</h2>
              <h2 className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>Create account</h2>
            </div>

            {error && (
              <div style={{ color: 'var(--violet-400)', fontSize: '0.75rem', marginBottom: '1rem', padding: '0.625rem 0.75rem', borderRadius: '0.625rem', background: 'rgba(var(--violet-rgb), 0.06)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.18)', fontFamily: 'var(--font-body)' }}>
                {error}
              </div>
            )}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {!isLogin && (
                <div className="form-group">
                  <label>First Name</label>
                  <input type="text" placeholder="Your name" required value={firstName} onChange={e => setFirstName(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" placeholder="••••••••" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary auth-submit" disabled={isLoading}>
                {isLoading
                  ? (isLogin ? 'Signing in…' : 'Creating account…')
                  : (isLogin ? 'Enter the Studio' : 'Create my account')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

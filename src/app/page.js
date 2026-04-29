'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

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
        // Login Logic
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        router.push('/dashboard');
      } else {
        // Registration Logic
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: firstName,
            },
          },
        });
        if (signUpError) throw signUpError;
        alert("Registration successful! Please check your email for a confirmation link.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="home-screen">
      <nav className="home-nav">
        <div className="home-logo">AURA.AI</div>
        <div className="home-nav-links">
          <Link href="#" className="nav-link">Features</Link>
          <Link href="#" className="nav-link">Gallery</Link>
          <button onClick={() => setShowAuth(true)} className="btn-teal">Login</button>
        </div>
      </nav>

      <main className="home-main">
        <div className="hero-section">
          <div className="hero-badge">Next-Gen AI Generation</div>
          <h1 className="hero-title">
            Bring your stories to <em>life.</em>
          </h1>
          <p className="hero-subtitle">
            Create stunning, cohesive music videos and films using cutting-edge AI models. No studio required.
          </p>
          <div className="hero-actions">
            <button onClick={() => setShowAuth(true)} className="btn-orange hero-cta">Login to get started</button>
            <Link href="#" className="btn-outline hero-cta">Watch Demo</Link>
          </div>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon teal-icon">✧</div>
            <h3>Brain Dump</h3>
            <p>Speak or type your raw ideas. Our AI structures them into perfect shot lists automatically.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon orange-icon">★</div>
            <h3>Character Consistency</h3>
            <p>Generate persistent character models that look identical across every single scene and shot.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon dark-icon">▶</div>
            <h3>Video Generation</h3>
            <p>Turn your static scenes into fluid, high-quality video clips using the powerful Veo 3 model.</p>
          </div>
        </div>
      </main>
      
      <footer className="home-footer">
        <p>© 2026 Aura AI Studio. All rights reserved.</p>
      </footer>

      {showAuth && (
        <div className="auth-overlay" onClick={() => setShowAuth(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowAuth(false)}>×</button>
            
            <div className="auth-header">
              <h2 className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>Login</h2>
              <h2 className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>Register</h2>
            </div>

            {error && <div style={{ color: '#ff4d4d', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>{error}</div>}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {!isLogin && (
                <div className="form-group">
                  <label>First Name</label>
                  <input 
                    type="text" 
                    placeholder="Your name" 
                    required 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  placeholder="you@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              
              <button type="submit" className="btn-orange auth-submit" disabled={isLoading}>
                {isLoading ? 'Processing...' : (isLogin ? 'Login to Studio' : 'Create Account')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

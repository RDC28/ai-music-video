import Link from 'next/link';

export default function Home() {
  return (
    <div className="home-screen">
      <nav className="home-nav">
        <div className="home-logo">AURA.AI</div>
        <div className="home-nav-links">
          <Link href="#" className="nav-link">Features</Link>
          <Link href="#" className="nav-link">Gallery</Link>
          <Link href="/create" className="btn-teal">Start Creating</Link>
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
            <Link href="/create" className="btn-orange hero-cta">Open Studio</Link>
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
    </div>
  );
}

import DashboardNav from '@/components/DashboardNav';
import Link from 'next/link';

export default function DashboardScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card projects-card">
          <div className="projects-header">
            <div className="card-title">Your Projects</div>
            <Link href="/create" className="btn-teal" style={{ padding: '8px 16px', fontSize: '12px', textDecoration: 'none' }}>+ New Project</Link>
          </div>
          
          <div className="projects-grid">
            <Link href="/create" style={{ textDecoration: 'none' }} className="project-item">
              <div className="project-thumb">
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #1A0A1A, #F05A28)' }} />
              </div>
              <div className="project-info">
                <strong>Godaan EP1</strong>
                <span>Edited 2 days ago</span>
              </div>
            </Link>

            <Link href="/create" style={{ textDecoration: 'none' }} className="project-item">
              <div className="project-thumb">
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #1A0A1A, #3D8C7A)' }} />
              </div>
              <div className="project-info">
                <strong>Summer Vibes MV</strong>
                <span>Edited 1 week ago</span>
              </div>
            </Link>

            <Link href="/create" style={{ textDecoration: 'none' }} className="project-item">
              <div className="project-thumb">
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #1A0A1A, #2A2622)' }} />
              </div>
              <div className="project-info">
                <strong>Cyberpunk City</strong>
                <span>Edited 2 weeks ago</span>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

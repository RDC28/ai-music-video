import DashboardNav from '@/components/DashboardNav';

export default function ProfileScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card">
          <div className="card-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>Profile Details</div>
          <div className="profile-header" style={{ marginTop: '16px' }}>
            <div className="profile-avatar">P</div>
            <div>
              <h2>Prateek</h2>
              <p>prateek@example.com</p>
            </div>
          </div>
          <button className="btn-outline-small" style={{ width: '100%', marginTop: '16px' }}>Edit Profile</button>
        </div>
      </main>
    </div>
  );
}

import DashboardNav from '@/components/DashboardNav';

export default function BillingScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card">
          <div className="card-title">Billing & Usage</div>
          <div className="billing-info" style={{ marginTop: '16px' }}>
            <div className="billing-row">
              <span>Current Plan</span>
              <strong>Pro Tier</strong>
            </div>
            <div className="billing-row">
              <span>Next Billing Date</span>
              <strong>May 12, 2026</strong>
            </div>
            <div className="billing-row" style={{ marginTop: '16px' }}>
              <span>Generation Minutes Used</span>
              <strong>45 / 120 mins</strong>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

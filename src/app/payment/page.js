import DashboardNav from '@/components/DashboardNav';

export default function PaymentScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card">
          <div className="card-title">Payment Methods</div>
          <div className="payment-card" style={{ marginTop: '16px' }}>
            <div className="card-icon">💳</div>
            <div className="card-details">
              <strong>Visa ending in 4242</strong>
              <span>Expires 12/28</span>
            </div>
          </div>
          <button className="btn-outline-small" style={{ width: '100%', marginTop: '16px' }}>+ Add Payment Method</button>
        </div>
      </main>
    </div>
  );
}

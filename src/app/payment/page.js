'use client';

import { useState, useEffect } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function PaymentScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsLoading(false);
    };
    init();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : (
          <div className="profile-card">
            <div className="card-title">Payment Methods</div>
            <div style={{
              marginTop: '24px',
              padding: '40px',
              textAlign: 'center',
              background: 'rgba(42, 38, 34, 0.03)',
              borderRadius: '16px',
              border: '2px dashed var(--border)',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
              <div style={{ fontWeight: 700, color: 'var(--dark)', marginBottom: '8px' }}>
                No Payment Methods
              </div>
              <div style={{ fontSize: '13px', color: '#888', lineHeight: 1.5 }}>
                Payment methods will be managed through Stripe once integration is complete.
                You can still purchase credits from the Billing page.
              </div>
            </div>
            <button
              className="btn-outline-small"
              style={{ width: '100%', marginTop: '16px', opacity: 0.5, cursor: 'not-allowed' }}
              disabled
            >
              + Add Payment Method (Coming Soon)
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

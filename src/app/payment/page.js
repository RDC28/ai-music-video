'use client';

import { useState, useEffect, useMemo } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function PaymentScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsLoading(false);
    };
    init();
  }, [supabase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '56px 56px 80px',
          maxWidth: '720px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: '52px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
            }}
          >
            Loading payment details…
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '36px' }}>
              <div className="kicker" style={{ marginBottom: '12px' }}>Studio · Account</div>
              <h2 className="editorial-title editorial-h1" style={{ marginBottom: '10px' }}>
                Payment <span className="text-grad">methods.</span>
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                Save a card here later, or top up directly from billing.
              </p>
            </div>

            <div className="premium-panel" style={{ padding: '40px' }}>
              <div
                style={{
                  padding: '48px 32px',
                  textAlign: 'center',
                  background:
                    'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(var(--cyan-rgb), 0.06), transparent 64%), rgba(var(--cyan-300-rgb), 0.022)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px dashed rgba(var(--cyan-rgb), 0.18)',
                }}
              >
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '24px',
                    margin: '0 auto 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(var(--cyan-rgb), 0.16), rgba(var(--cyan-rgb), 0.04))',
                    border: '1px solid rgba(var(--cyan-rgb), 0.28)',
                    boxShadow: '0 14px 36px rgba(var(--cyan-rgb), 0.18), inset 0 1px 0 rgba(var(--cyan-300-rgb), 0.1)',
                    color: 'var(--orange)',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="3" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <div className="editorial-title editorial-h3" style={{ marginBottom: '10px' }}>
                  No cards saved yet.
                </div>
                <div
                  style={{
                    fontSize: '13.5px',
                    color: 'var(--text-soft)',
                    lineHeight: 1.65,
                    maxWidth: '420px',
                    margin: '0 auto',
                  }}
                >
                  Saved payment methods aren&apos;t available yet. You can still purchase credits from the billing page.
                </div>
              </div>
              <button
                className="btn-outline"
                style={{ width: '100%', marginTop: '20px', opacity: 0.5, cursor: 'not-allowed', justifyContent: 'center' }}
                disabled
              >
                Add payment method
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

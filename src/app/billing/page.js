'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function BillingScreen() {
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
    }
  }, [supabase]);

  const fetchTransactions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setTransactions(data || []);
    }
    setIsLoadingTx(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([fetchProfile(), fetchTransactions()]);
  }, [fetchProfile, fetchTransactions]);

  const handleTopUp = async (priceId, credits) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, credits })
      });

      const { url, error } = await res.json();
      if (url) {
        window.location.assign(url);
      } else {
        throw new Error(error);
      }
    } catch (err) {
      console.error("Payment failed:", err);
      alert("Checkout could not be started. Please try again in a moment.");
    } finally {
      setIsProcessing(false);
    }
  };

  const plans = [
    { label: 'Starter', credits: 500, price: '$10.00', priceId: 'price_starter_id', btnClass: 'btn-outline' },
    { label: 'Pro', credits: 1500, price: '$25.00', priceId: 'price_pro_id', btnClass: 'btn-teal', popular: true },
    { label: 'Studio', credits: 5000, price: '$75.00', priceId: 'price_studio_id', btnClass: 'btn-outline' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '56px 56px 80px',
          maxWidth: '1040px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: '40px' }}>
          <div className="kicker" style={{ marginBottom: '12px' }}>Studio · Account</div>
          <h2 className="editorial-title editorial-h1" style={{ marginBottom: '10px' }}>
            Billing &amp; <span className="text-grad">credits.</span>
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '540px', lineHeight: 1.65 }}>
            Top up your studio credits and review every transaction.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }}>
          <div
            className="premium-panel"
            style={{
              padding: '28px',
              background:
                'linear-gradient(155deg, rgba(0,229,255,0.14), rgba(0,184,212,0.04)), linear-gradient(180deg, rgba(14,17,22,0.95), rgba(11,14,19,0.86))',
              borderColor: 'rgba(0,229,255,0.24)',
            }}
          >
            <div className="kicker">── Current balance</div>
            <div
              className="metric-display"
              style={{ fontSize: 'clamp(48px, 6vw, 76px)', marginTop: '16px' }}
            >
              <span className="text-grad">{profile?.credits ?? 0}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginLeft: '12px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  WebkitTextFillColor: 'currentcolor',
                  background: 'none',
                }}
              >
                credits
              </span>
            </div>
          </div>
          <div className="premium-panel" style={{ padding: '28px' }}>
            <div className="kicker kicker--muted">── Plan type</div>
            <div
              className="metric-display"
              style={{ fontSize: 'clamp(28px, 3vw, 40px)', marginTop: '16px', fontStyle: 'italic' }}
            >
              Pay-as-you-go.
            </div>
            <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
              No subscription. Credits never expire.
            </div>
          </div>
        </div>

        {/* Pricing section */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 className="editorial-title editorial-h3" style={{ fontSize: '24px' }}>
              Top up <span className="text-grad">credits.</span>
            </h3>
            <div className="mono-label">── 03 Plans</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {plans.map((plan) => (
              <div
                key={plan.label}
                className="premium-panel"
                style={{
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  textAlign: 'center',
                  position: 'relative',
                  borderColor: plan.popular ? 'rgba(0,229,255,0.32)' : undefined,
                  background: plan.popular
                    ? 'linear-gradient(155deg, rgba(0,229,255,0.14), rgba(0,184,212,0.04)), linear-gradient(180deg, rgba(14,17,22,0.95), rgba(11,14,19,0.86))'
                    : undefined,
                  boxShadow: plan.popular ? 'var(--glow-soft), var(--shadow-premium)' : 'var(--shadow-premium)',
                  overflow: 'visible',
                }}
              >
                {plan.popular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                      color: '#04060A',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '5px 14px',
                      borderRadius: '999px',
                      fontFamily: 'var(--font-mono)',
                      boxShadow: '0 8px 22px rgba(0,229,255,0.35)',
                    }}
                  >
                    ◇ Most popular
                  </div>
                )}
                <div className={`kicker ${plan.popular ? 'kicker--orange' : 'kicker--muted'}`} style={{ justifyContent: 'center', marginTop: plan.popular ? '6px' : 0 }}>
                  {plan.label}
                </div>
                <div className="metric-display" style={{ fontSize: 'clamp(36px, 4vw, 52px)' }}>
                  <span className={plan.popular ? 'text-grad' : ''}>{plan.credits.toLocaleString()}</span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    marginTop: '-6px',
                  }}
                >
                  credits
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: '22px',
                    fontWeight: 500,
                    color: 'var(--dark)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {plan.price}
                </div>
                <button
                  className={plan.btnClass}
                  onClick={() => handleTopUp(plan.priceId, plan.credits)}
                  disabled={isProcessing}
                  style={{ width: '100%', fontSize: '12px', justifyContent: 'center', marginTop: '6px' }}
                >
                  {isProcessing ? 'Opening checkout…' : 'Buy credits'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction history */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 className="editorial-title editorial-h3" style={{ fontSize: '24px' }}>
              Transaction history.
            </h3>
            <div className="mono-label">Last 10</div>
          </div>
          <div className="premium-panel" style={{ overflow: 'hidden' }}>
            {isLoadingTx ? (
              <div style={{ padding: '28px', color: 'var(--text-muted)', fontSize: '13px' }}>Loading history…</div>
            ) : transactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {transactions.map((tx, i) => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '18px 24px',
                      borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.18s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 500,
                          color: 'var(--dark)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          marginBottom: '4px',
                          letterSpacing: '-0.015em',
                        }}
                      >
                        {tx.action.charAt(0).toUpperCase() + tx.action.slice(1).replace(/_/g, ' ')}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {new Date(tx.created_at).toLocaleDateString()} · {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 500,
                        color: tx.amount > 0 ? 'var(--teal)' : '#ff8a8a',
                        fontFamily: 'var(--font-display)',
                        fontStyle: 'italic',
                        letterSpacing: '-0.025em',
                      }}
                    >
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '52px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                Nothing yet.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

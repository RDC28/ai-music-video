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
    { label: 'Pro', credits: 1500, price: '$25.00', priceId: 'price_pro_id', btnClass: 'btn-secondary', popular: true },
    { label: 'Studio', credits: 5000, price: '$75.00', priceId: 'price_studio_id', btnClass: 'btn-outline' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '3.5rem 3.5rem 5rem',
          maxWidth: '65rem',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="kicker" style={{ marginBottom: '0.75rem' }}>Studio · Account</div>
          <h2 className="editorial-title editorial-h1" style={{ marginBottom: '0.625rem' }}>
            Billing &amp; <span className="text-grad">credits.</span>
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '33.75rem', lineHeight: 1.65 }}>
            Top up your studio credits and review every transaction.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '3rem' }}>
          <div
            className="premium-panel"
            style={{
              padding: '1.75rem',
              background:
                'linear-gradient(155deg, rgba(var(--cyan-rgb), 0.14), rgba(var(--cyan-rgb), 0.04)), linear-gradient(180deg, rgba(var(--ink-900-rgb), 0.95), rgba(var(--ink-900-rgb), 0.86))',
              borderColor: 'rgba(var(--cyan-rgb), 0.24)',
            }}
          >
            <div className="kicker">── Current balance</div>
            <div
              className="metric-display"
              style={{ fontSize: 'clamp(3rem, 6vw, 4.75rem)', marginTop: '1rem' }}
            >
              <span className="text-grad">{profile?.credits ?? 0}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginLeft: '0.75rem',
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
          <div className="premium-panel" style={{ padding: '1.75rem' }}>
            <div className="kicker kicker--muted">── Plan type</div>
            <div
              className="metric-display"
              style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', marginTop: '1rem', fontStyle: 'italic' }}
            >
              Pay-as-you-go.
            </div>
            <div style={{ marginTop: '0.625rem', color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.6 }}>
              No subscription. Credits never expire.
            </div>
          </div>
        </div>

        {/* Pricing section */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 className="editorial-title editorial-h3" style={{ fontSize: '1.5rem' }}>
              Top up <span className="text-grad">credits.</span>
            </h3>
            <div className="mono-label">── 03 Plans</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
            {plans.map((plan) => (
              <div
                key={plan.label}
                className="premium-panel"
                style={{
                  padding: '1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  textAlign: 'center',
                  position: 'relative',
                  borderColor: plan.popular ? 'rgba(var(--cyan-rgb), 0.32)' : undefined,
                  background: plan.popular
                    ? 'linear-gradient(155deg, rgba(var(--cyan-rgb), 0.14), rgba(var(--cyan-rgb), 0.04)), linear-gradient(180deg, rgba(var(--ink-900-rgb), 0.95), rgba(var(--ink-900-rgb), 0.86))'
                    : undefined,
                  boxShadow: plan.popular ? 'var(--glow-soft), var(--shadow-premium)' : 'var(--shadow-premium)',
                  overflow: 'visible',
                }}
              >
                {plan.popular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-0.75rem',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                      color: 'var(--ink-950)',
                      fontSize: '0.5938rem',
                      fontWeight: 600,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '0.3125rem 0.875rem',
                      borderRadius: '62.4375rem',
                      fontFamily: 'var(--font-mono)',
                      boxShadow: '0 0.5rem 1.375rem rgba(var(--cyan-rgb), 0.35)',
                    }}
                  >
                    ◇ Most popular
                  </div>
                )}
                <div className={`kicker ${plan.popular ? 'kicker--orange' : 'kicker--muted'}`} style={{ justifyContent: 'center', marginTop: plan.popular ? '0.375rem' : 0 }}>
                  {plan.label}
                </div>
                <div className="metric-display" style={{ fontSize: 'clamp(2.25rem, 4vw, 3.25rem)' }}>
                  <span className={plan.popular ? 'text-grad' : ''}>{plan.credits.toLocaleString()}</span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    marginTop: '-0.375rem',
                  }}
                >
                  credits
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: '1.375rem',
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
                  style={{ width: '100%', fontSize: '0.75rem', justifyContent: 'center', marginTop: '0.375rem' }}
                >
                  {isProcessing ? 'Opening checkout…' : 'Buy credits'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction history */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 className="editorial-title editorial-h3" style={{ fontSize: '1.5rem' }}>
              Transaction history.
            </h3>
            <div className="mono-label">Last 10</div>
          </div>
          <div className="premium-panel" style={{ overflow: 'hidden' }}>
            {isLoadingTx ? (
              <div style={{ padding: '1.75rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Loading history…</div>
            ) : transactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {transactions.map((tx, i) => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1.125rem 1.5rem',
                      borderBottom: i < transactions.length - 1 ? '0.0625rem solid var(--border)' : 'none',
                      transition: 'background 0.18s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--cyan-300-rgb), 0.02)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.9375rem',
                          fontWeight: 500,
                          color: 'var(--dark)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          marginBottom: '0.25rem',
                          letterSpacing: '-0.015em',
                        }}
                      >
                        {tx.action.charAt(0).toUpperCase() + tx.action.slice(1).replace(/_/g, ' ')}
                      </div>
                      <div
                        style={{
                          fontSize: '0.6875rem',
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
                        fontSize: '1.125rem',
                        fontWeight: 500,
                        color: tx.amount > 0 ? 'var(--teal)' : 'var(--violet-400)',
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
              <div style={{ padding: '3.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8438rem', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                Nothing yet.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

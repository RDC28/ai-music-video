'use client';

import { useState, useEffect } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function BillingScreen() {
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchProfile();
    fetchTransactions();
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
    }
  };

  const fetchTransactions = async () => {
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
  };

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
        window.location.href = url;
      } else {
        throw new Error(error);
      }
    } catch (err) {
      console.error("Payment failed:", err);
      alert("Failed to start checkout. Make sure you added your STRIPE_SECRET_KEY to .env.local!");
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <DashboardNav />

      <main style={{ padding: '40px 48px', maxWidth: '900px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Page title */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '4px' }}>
            Billing &amp; Usage
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Manage your credits and subscription
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
          <div style={{
            background: 'rgba(0,184,212,0.06)',
            border: '1px solid rgba(0,184,212,0.15)',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
              Current Balance
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, color: 'var(--dark)', letterSpacing: '-0.02em' }}>
              {profile?.credits ?? 0}
              <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '6px' }}>credits</span>
            </div>
          </div>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
              Plan Type
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--dark)' }}>
              Pay-As-You-Go
            </div>
          </div>
        </div>

        {/* Pricing section */}
        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--dark)', marginBottom: '16px', letterSpacing: '-0.01em' }}>
            Top Up Credits
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {plans.map((plan) => (
              <div
                key={plan.label}
                style={{
                  background: plan.popular ? 'rgba(0,184,212,0.05)' : 'var(--card)',
                  border: plan.popular ? '1px solid rgba(0,184,212,0.25)' : '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-1px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--teal)',
                    color: '#0A0A0A',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: '0 0 6px 6px',
                    fontFamily: 'var(--font-display)',
                  }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: plan.popular ? 'var(--teal)' : 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: plan.popular ? '8px' : 0 }}>
                  {plan.label}
                </div>
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--dark)' }}>{plan.credits.toLocaleString()}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '4px' }}>credits</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dark)', fontFamily: 'var(--font-display)' }}>
                  {plan.price}
                </div>
                <button
                  className={plan.btnClass}
                  onClick={() => handleTopUp(plan.priceId, plan.credits)}
                  disabled={isProcessing}
                  style={{ width: '100%', fontSize: '12px' }}
                >
                  {isProcessing ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction history */}
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--dark)', marginBottom: '16px', letterSpacing: '-0.01em' }}>
            Transaction History
          </h3>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            {isLoadingTx ? (
              <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>Loading history...</div>
            ) : transactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {transactions.map((tx, i) => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 20px',
                      borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)', fontFamily: 'var(--font-display)', marginBottom: '2px' }}>
                        {tx.action.charAt(0).toUpperCase() + tx.action.slice(1).replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(tx.created_at).toLocaleDateString()} · {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: tx.amount > 0 ? 'var(--teal)' : 'rgba(255,80,80,0.9)',
                      fontFamily: 'var(--font-display)',
                    }}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No transactions yet.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

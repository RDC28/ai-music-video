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
        body: JSON.stringify({
          priceId,
          credits
        })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card" style={{ marginBottom: '32px' }}>
          <div className="card-title">Billing & Usage</div>
          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ background: 'var(--teal)', color: '#fff', padding: '24px', borderRadius: '16px', flex: 1 }}>
              <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 700 }}>CURRENT BALANCE</div>
              <div style={{ fontSize: '32px', fontWeight: 800 }}>{profile?.credits || 0} Credits</div>
            </div>
            <div style={{ background: 'var(--dark)', color: '#fff', padding: '24px', borderRadius: '16px', flex: 1 }}>
              <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 700 }}>PLAN TYPE</div>
              <div style={{ fontSize: '32px', fontWeight: 800 }}>Pay-As-You-Go</div>
            </div>
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: '24px' }}>Top Up Credits</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '48px' }}>
          
          <div className="profile-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--teal)' }}>STARTER</div>
            <div style={{ fontSize: '28px', fontWeight: 800 }}>500 <span style={{ fontSize: '14px' }}>credits</span></div>
            <div style={{ fontSize: '18px', color: '#666' }}>$10.00</div>
            <button 
              className="btn-orange" 
              onClick={() => handleTopUp('price_starter_id', 500)}
              disabled={isProcessing}
            >
              Buy Now
            </button>
          </div>

          <div className="profile-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px', border: '2px solid var(--teal)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--teal)' }}>MOST POPULAR</div>
            <div style={{ fontSize: '28px', fontWeight: 800 }}>1500 <span style={{ fontSize: '14px' }}>credits</span></div>
            <div style={{ fontSize: '18px', color: '#666' }}>$25.00</div>
            <button 
              className="btn-teal" 
              onClick={() => handleTopUp('price_pro_id', 1500)}
              disabled={isProcessing}
            >
              Buy Now
            </button>
          </div>

          <div className="profile-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--teal)' }}>STUDIO</div>
            <div style={{ fontSize: '28px', fontWeight: 800 }}>5000 <span style={{ fontSize: '14px' }}>credits</span></div>
            <div style={{ fontSize: '18px', color: '#666' }}>$75.00</div>
            <button 
              className="btn-orange" 
              onClick={() => handleTopUp('price_studio_id', 5000)}
              disabled={isProcessing}
            >
              Buy Now
            </button>
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: '24px' }}>Transaction History</div>
        <div className="profile-card" style={{ padding: '0' }}>
          {isLoadingTx ? (
            <div style={{ padding: '24px', color: '#666' }}>Loading history...</div>
          ) : transactions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dark)' }}>
                      {tx.action.toUpperCase().replace('_', ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {new Date(tx.created_at).toLocaleDateString()} at {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: tx.amount > 0 ? 'var(--teal)' : 'var(--orange)' }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              No transactions found yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

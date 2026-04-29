'use client';

import { useState, useEffect } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function BillingScreen() {
  const [profile, setProfile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchProfile();
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

  const handleTopUp = async (priceId, credits) => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const res = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          userId: user.id,
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          
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
      </main>
    </div>
  );
}

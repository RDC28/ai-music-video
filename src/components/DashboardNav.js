'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

export default function DashboardNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const isActive = (path) => pathname === path;

  const activeStyle = {
    backgroundColor: 'rgba(61, 140, 122, 0.1)',
    color: 'var(--teal)',
    fontWeight: 700,
  };

  return (
    <nav className="home-nav" style={{ padding: '24px 48px', borderBottom: '2px solid var(--border)', background: 'var(--cream)' }}>
      <Link href="/dashboard" className="home-logo" style={{ textDecoration: 'none' }}>AURA.AI</Link>
      
      <div className="home-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--dark)' }}>
            Hi, {profile?.full_name?.split(' ')[0] || 'User'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 700, letterSpacing: '0.05em' }}>
            {profile?.credits || 0} CREDITS
          </span>
        </div>

        <div className="hamburger-container" style={{ position: 'relative' }}>
          <div 
            className="hamburger" 
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ fontSize: '24px', cursor: 'pointer', userSelect: 'none', color: 'var(--dark)' }}
          >
            ☰
          </div>
          {menuOpen && (
            <div className="dropdown-menu">
              <Link href="/dashboard" className="dropdown-item" style={isActive('/dashboard') ? activeStyle : {}}>Projects Dashboard</Link>
              <Link href="/profile" className="dropdown-item" style={isActive('/profile') ? activeStyle : {}}>Profile Details</Link>
              <Link href="/billing" className="dropdown-item" style={isActive('/billing') ? activeStyle : {}}>Billing &amp; Usage</Link>
              <Link href="/payment" className="dropdown-item" style={isActive('/payment') ? activeStyle : {}}>Payment Methods</Link>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button 
                onClick={handleLogout} 
                className="dropdown-item" 
                style={{ color: 'var(--orange)', border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
              >
                Log out
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}

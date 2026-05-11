'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

export default function DashboardNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const menuRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const isActive = (path) => pathname === path;
  const navLinks = [
    { href: '/dashboard', label: 'Projects' },
    { href: '/billing', label: 'Billing' },
    { href: '/profile', label: 'Profile' },
  ];
  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';

  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0 52px', height: '64px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'linear-gradient(180deg, rgba(12,12,18,0.88), rgba(6,6,8,0.62))',
      backdropFilter: 'blur(28px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.5)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{
        textDecoration: 'none',
        fontFamily: 'var(--font-display)', fontStyle: 'italic',
        fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em',
        background: 'linear-gradient(135deg, var(--dark) 30%, var(--violet))',
        WebkitBackgroundClip: 'text', backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Aura
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {navLinks.map(link => (
          <Link key={link.href} href={link.href} style={{
            fontFamily: 'var(--font-body)', fontSize: '12.5px', fontWeight: 600,
            textDecoration: 'none', padding: '7px 16px', borderRadius: '10px',
            color: isActive(link.href) ? 'var(--violet)' : 'var(--text-muted)',
            background: isActive(link.href) ? 'rgba(124,58,237,0.12)' : 'transparent',
            boxShadow: isActive(link.href) ? '0 0 0 1px rgba(124,58,237,0.24)' : 'none',
            transition: 'color 0.18s, background 0.18s', letterSpacing: '-0.005em',
          }}>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right: Credits + Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} ref={menuRef}>
        {/* Credits badge — amber */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '5px 12px', borderRadius: '10px',
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.24)',
          boxShadow: '0 0 20px rgba(245,158,11,0.06)',
        }}>
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: 'var(--amber)', flexShrink: 0,
            boxShadow: '0 0 8px rgba(245,158,11,0.8)',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500,
            color: 'var(--amber)', letterSpacing: '0.08em',
          }}>
            {profile?.credits ?? '—'}&nbsp;CREDITS
          </span>
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(109,40,217,0.06))',
              border: '1px solid rgba(124,58,237,0.32)',
              color: 'var(--violet)',
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontSize: '15px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.3s var(--ease-spring), box-shadow 0.3s',
              boxShadow: '0 8px 22px rgba(124,58,237,0.2)',
            }}
            onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-1px) scale(1.04)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0) scale(1)')}
          >
            {initial}
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              background: 'rgba(12,12,18,0.97)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '14px', minWidth: '200px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
              padding: '6px',
              animation: 'panelRise 280ms var(--ease-premium) both',
            }}>
              <div style={{ padding: '12px 14px 12px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '16px', fontWeight: 500, color: 'var(--dark)', letterSpacing: '-0.02em' }}>
                  {profile?.full_name || 'User'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginTop: '3px' }}>
                  {profile?.credits ?? 0} CREDITS REMAINING
                </div>
              </div>
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} style={{
                  display: 'block', padding: '9px 14px', borderRadius: '8px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: 500,
                  color: isActive(link.href) ? 'var(--violet)' : 'var(--text-soft)',
                  background: isActive(link.href) ? 'rgba(124,58,237,0.1)' : 'transparent',
                  transition: 'background 0.14s, color 0.14s',
                }}
                  onMouseOver={e => { if (!isActive(link.href)) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseOut={e => { if (!isActive(link.href)) e.currentTarget.style.background = 'transparent'; }}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/payment" onClick={() => setMenuOpen(false)} style={{
                display: 'block', padding: '9px 14px', borderRadius: '8px',
                textDecoration: 'none', fontSize: '13px', fontWeight: 500,
                color: 'var(--text-soft)', transition: 'background 0.14s',
              }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                Payment Methods
              </Link>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px' }} />
              <button onClick={handleLogout} style={{
                display: 'block', width: '100%', padding: '9px 14px', borderRadius: '8px',
                border: 'none', background: 'transparent', textAlign: 'left',
                fontSize: '13px', fontWeight: 500, color: '#f87171',
                cursor: 'pointer', transition: 'background 0.14s',
              }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

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

  const navLinks = [
    { href: '/dashboard', label: 'Projects' },
    { href: '/billing', label: 'Billing' },
    { href: '/profile', label: 'Profile' },
  ];

  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 40px',
      height: '60px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--cream)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>

      {/* Logo */}
      <Link href="/dashboard" style={{
        textDecoration: 'none',
        fontFamily: 'var(--font-display)',
        fontSize: '17px',
        fontWeight: 800,
        color: 'var(--dark)',
        letterSpacing: '-0.02em',
      }}>
        AURA.AI
      </Link>

      {/* Nav links (desktop) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {navLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              padding: '5px 12px',
              borderRadius: '6px',
              color: isActive(link.href) ? 'var(--dark)' : 'var(--text-muted)',
              background: isActive(link.href) ? 'rgba(255,255,255,0.06)' : 'transparent',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right: Credits + Avatar menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} ref={menuRef}>

        {/* Credit balance */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '6px',
          background: 'rgba(0, 184, 212, 0.08)',
          border: '1px solid rgba(0, 184, 212, 0.15)',
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.03em' }}>
            {profile?.credits ?? '—'} credits
          </span>
        </div>

        {/* Avatar / Menu trigger */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              color: 'var(--orange)',
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {initial}
          </button>

          {menuOpen && (
            <div className="dropdown-menu">
              <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--dark)', marginBottom: '2px' }}>
                  {profile?.full_name || 'User'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {profile?.credits ?? 0} credits remaining
                </div>
              </div>
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="dropdown-item"
                  style={isActive(link.href) ? { color: 'var(--orange)', background: 'rgba(0,229,255,0.06)' } : {}}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/payment" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                Payment Methods
              </Link>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button
                onClick={handleLogout}
                className="dropdown-item"
                style={{ color: '#ef4444', border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 500 }}
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

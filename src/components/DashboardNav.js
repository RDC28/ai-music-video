'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Zap, LogOut, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dropdown } from '@/lib/motion';

export default function DashboardNav() {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [profile, setProfile]     = useState(null);
  const pathname                  = usePathname();
  const router                    = useRouter();
  const supabase                  = createClient();
  const menuRef                   = useRef(null);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
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
    { href: '/billing',   label: 'Billing' },
    { href: '/profile',   label: 'Profile' },
  ];
  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 32px',
      height: '56px',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(17,17,20,0.92)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>

      {/* Logo */}
      <Link href="/dashboard" style={{
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--neo-flat)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: '700',
          color: 'var(--cyan)',
        }}>
          A
        </div>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          fontWeight: '700',
          color: 'var(--text)',
          letterSpacing: '-0.02em',
        }}>
          Aura
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {navLinks.map(link => (
          <Link key={link.href} href={link.href} style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: '500',
            textDecoration: 'none',
            padding: '6px 14px',
            borderRadius: '8px',
            color: isActive(link.href) ? 'var(--cyan)' : 'var(--text-muted)',
            background: isActive(link.href) ? 'var(--cyan-dim)' : 'transparent',
            border: isActive(link.href) ? '1px solid var(--cyan-border)' : '1px solid transparent',
            transition: 'color 140ms ease-out, background 140ms ease-out, border-color 140ms ease-out',
          }}>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right: credits + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} ref={menuRef}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: '8px',
          background: 'var(--surface-2)',
          boxShadow: 'var(--neo-inset)',
          border: '1px solid var(--border)',
        }}>
          <Zap size={11} color="var(--cyan)" />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: '700',
            color: 'var(--text-soft)',
            letterSpacing: '0.06em',
          }}>
            {profile?.credits ?? '—'}
          </span>
        </div>

        {/* Avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--surface-2)',
              boxShadow: menuOpen ? 'var(--neo-active)' : 'var(--neo-flat)',
              border: '1px solid var(--border-mid)',
              color: 'var(--cyan)',
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'box-shadow 160ms ease-out',
            }}
          >
            {initial}
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                variants={dropdown}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-mid)',
                  borderRadius: 'var(--radius-lg)',
                  minWidth: '200px',
                  boxShadow: 'var(--shadow-modal)',
                  padding: '6px',
                  transformOrigin: 'top right',
                }}
              >
                <div style={{
                  padding: '10px 12px 10px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: '4px',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text)',
                    letterSpacing: '-0.02em',
                  }}>
                    {profile?.full_name || 'User'}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.06em',
                    marginTop: '3px',
                  }}>
                    {profile?.credits ?? 0} CREDITS
                  </div>
                </div>

                {navLinks.map(link => (
                  <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: isActive(link.href) ? 'var(--cyan)' : 'var(--text-soft)',
                    background: isActive(link.href) ? 'var(--cyan-dim)' : 'transparent',
                    transition: 'background 120ms ease-out, color 120ms ease-out',
                  }}>
                    {link.label}
                  </Link>
                ))}
                <Link href="/payment" onClick={() => setMenuOpen(false)} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'var(--text-soft)',
                  transition: 'background 120ms ease-out',
                }}>
                  <CreditCard size={13} />
                  Payment
                </Link>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button onClick={handleLogout} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'var(--error)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease-out',
                }}>
                  <LogOut size={13} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
}

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
    <nav className="dash-nav">

      {/* Logo */}
      <Link href="/dashboard" className="dash-nav-logo">
        <div className="dash-nav-logo-mark">A</div>
        <span className="dash-nav-logo-name">Aura</span>
      </Link>

      {/* Nav links */}
      <div className="dash-nav-links">
        {navLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`dash-nav-link${isActive(link.href) ? ' active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right: credits + avatar */}
      <div className="flex-row gap-10" style={{ alignItems: 'center' }} ref={menuRef}>
        <div className="dash-nav-credits">
          <Zap size={11} color="var(--cyan)" />
          <span className="dash-nav-credits-val">{profile?.credits ?? '—'}</span>
        </div>

        {/* Avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="dash-nav-avatar"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ boxShadow: menuOpen ? 'var(--neo-active)' : 'var(--neo-flat)' }}
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
                className="dash-dropdown"
              >
                <div className="dash-dropdown-header">
                  <div className="dash-dropdown-name">{profile?.full_name || 'User'}</div>
                  <div className="dash-dropdown-credits">{profile?.credits ?? 0} CREDITS</div>
                </div>

                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`dash-dropdown-link${isActive(link.href) ? ' active' : ''}`}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/payment"
                  onClick={() => setMenuOpen(false)}
                  className="dash-dropdown-link"
                >
                  <CreditCard size={13} />
                  Payment
                </Link>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button className="dash-dropdown-btn" onClick={handleLogout}>
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

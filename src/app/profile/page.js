'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function ProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile({ ...data, email: user.email });
      setEditName(data?.full_name || '');
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim() })
        .eq('id', profile.id);
      if (error) throw error;
      setProfile(prev => ({ ...prev, full_name: editName.trim() }));
      setIsEditing(false);
    } catch {
      alert('Profile could not be updated. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.875rem 0',
    borderBottom: '0.0625rem solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '3.5rem 3.5rem 5rem',
          maxWidth: '45rem',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: '2.25rem' }}>
          <div className="kicker" style={{ marginBottom: '0.75rem' }}>Studio · You</div>
          <h2 className="editorial-title editorial-h1" style={{ marginBottom: '0.625rem' }}>
            Your <span className="text-grad">profile.</span>
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
            Manage how the studio sees you.
          </p>
        </div>

        {isLoading ? (
          <div
            style={{
              padding: '3.25rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
            }}
          >
            Loading your profile…
          </div>
        ) : (
          <>
            {/* Profile card */}
            <div className="premium-panel" style={{ padding: '2rem', marginBottom: '1.25rem' }}>
              <div className="kicker" style={{ marginBottom: '1.5rem' }}>── Profile</div>

              {/* Avatar + info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.375rem', marginBottom: '1.5rem' }}>
                <div
                  style={{
                    width: '4.5rem',
                    height: '4.5rem',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 600,
                    fontSize: '2rem',
                    color: 'var(--ink-950)',
                    flexShrink: 0,
                    boxShadow: '0 1rem 2.5rem rgba(var(--cyan-rgb), 0.32), inset 0 0.125rem 0 rgba(var(--cyan-300-rgb), 0.4)',
                    letterSpacing: '-0.025em',
                  }}
                >
                  {initial}
                </div>

                <div style={{ flex: 1 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          padding: '0.75rem 1rem',
                          border: '0.0625rem solid rgba(var(--cyan-rgb), 0.5)',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: '1.25rem',
                          fontWeight: 500,
                          outline: 'none',
                          background: 'rgba(var(--cyan-300-rgb), 0.04)',
                          color: 'var(--dark)',
                          width: '100%',
                          boxSizing: 'border-box',
                          letterSpacing: '-0.022em',
                          boxShadow: '0 0 0 0.25rem rgba(var(--cyan-rgb), 0.08)',
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-orange"
                          style={{ padding: '0.5rem 1.125rem', fontSize: '0.75rem' }}
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          className="btn-outline"
                          style={{ padding: '0.5rem 1.125rem', fontSize: '0.75rem' }}
                          onClick={() => { setIsEditing(false); setEditName(profile?.full_name || ''); }}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="editorial-title editorial-h2" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: '0.375rem' }}>
                        {profile?.full_name || 'Unnamed.'}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7812rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {profile?.email || 'No email'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isEditing && (
                <button
                  className="btn-outline"
                  style={{ width: '100%', fontSize: '0.75rem', justifyContent: 'center' }}
                  onClick={() => setIsEditing(true)}
                >
                  Edit name
                </button>
              )}
            </div>

            {/* Account info */}
            <div className="premium-panel" style={{ padding: '2rem' }}>
              <div className="kicker kicker--muted" style={{ marginBottom: '1.25rem' }}>── Account</div>

              <div style={rowStyle}>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  Credits Balance
                </span>
                <span
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 500,
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    letterSpacing: '-0.025em',
                    background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {profile?.credits ?? 0}
                </span>
              </div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  Member Since
                </span>
                <span
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    letterSpacing: '-0.015em',
                  }}
                >
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

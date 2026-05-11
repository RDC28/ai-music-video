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
    padding: '14px 0',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '56px 56px 80px',
          maxWidth: '720px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: '36px' }}>
          <div className="kicker" style={{ marginBottom: '12px' }}>Studio · You</div>
          <h2 className="editorial-title editorial-h1" style={{ marginBottom: '10px' }}>
            Your <span className="text-grad">profile.</span>
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
            Manage how the studio sees you.
          </p>
        </div>

        {isLoading ? (
          <div
            style={{
              padding: '52px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
            }}
          >
            Loading your profile…
          </div>
        ) : (
          <>
            {/* Profile card */}
            <div className="premium-panel" style={{ padding: '32px', marginBottom: '20px' }}>
              <div className="kicker" style={{ marginBottom: '24px' }}>── Profile</div>

              {/* Avatar + info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '22px', marginBottom: '24px' }}>
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--orange), var(--teal))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 600,
                    fontSize: '32px',
                    color: '#04060A',
                    flexShrink: 0,
                    boxShadow: '0 16px 40px rgba(0,229,255,0.32), inset 0 2px 0 rgba(255,255,255,0.4)',
                    letterSpacing: '-0.025em',
                  }}
                >
                  {initial}
                </div>

                <div style={{ flex: 1 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          padding: '12px 16px',
                          border: '1px solid rgba(0,229,255,0.5)',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: '20px',
                          fontWeight: 500,
                          outline: 'none',
                          background: 'rgba(255,255,255,0.04)',
                          color: 'var(--dark)',
                          width: '100%',
                          boxSizing: 'border-box',
                          letterSpacing: '-0.022em',
                          boxShadow: '0 0 0 4px rgba(0,229,255,0.08)',
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-orange"
                          style={{ padding: '8px 18px', fontSize: '12px' }}
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          className="btn-outline"
                          style={{ padding: '8px 18px', fontSize: '12px' }}
                          onClick={() => { setIsEditing(false); setEditName(profile?.full_name || ''); }}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="editorial-title editorial-h2" style={{ fontSize: 'clamp(24px, 3vw, 32px)', marginBottom: '6px' }}>
                        {profile?.full_name || 'Unnamed.'}
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
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
                  style={{ width: '100%', fontSize: '12px', justifyContent: 'center' }}
                  onClick={() => setIsEditing(true)}
                >
                  Edit name
                </button>
              )}
            </div>

            {/* Account info */}
            <div className="premium-panel" style={{ padding: '32px' }}>
              <div className="kicker kicker--muted" style={{ marginBottom: '20px' }}>── Account</div>

              <div style={rowStyle}>
                <span
                  style={{
                    fontSize: '11px',
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
                    fontSize: '24px',
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
                    fontSize: '11px',
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
                    fontSize: '15px',
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

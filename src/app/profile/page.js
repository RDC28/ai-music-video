'use client';

import { useState, useEffect } from 'react';
import DashboardNav from '@/components/DashboardNav';
import { createClient } from '@/utils/supabase';

export default function ProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
      setProfile({ ...data, email: user.email });
      setEditName(data?.full_name || '');
    }
    setIsLoading(false);
  };

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
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <DashboardNav />

      <main style={{ padding: '40px 48px', maxWidth: '600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Page title */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '4px' }}>
            Profile
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Manage your account details
          </p>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading profile...</div>
        ) : (
          <>
            {/* Profile card */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px', fontFamily: 'var(--font-display)' }}>
                Profile Details
              </div>

              {/* Avatar + info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '20px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--teal), rgba(0,184,212,0.5))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '20px',
                  color: '#0A0A0A',
                  flexShrink: 0,
                }}>
                  {initial}
                </div>

                <div style={{ flex: 1 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid var(--teal)',
                          borderRadius: '8px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '15px',
                          fontWeight: 600,
                          outline: 'none',
                          background: 'var(--surface)',
                          color: 'var(--dark)',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-teal"
                          style={{ padding: '6px 16px', fontSize: '12px' }}
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px 16px', fontSize: '12px' }}
                          onClick={() => { setIsEditing(false); setEditName(profile?.full_name || ''); }}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--dark)', marginBottom: '3px' }}>
                        {profile?.full_name || 'Unnamed User'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {profile?.email || 'No email'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isEditing && (
                <button
                  className="btn-outline"
                  style={{ width: '100%', fontSize: '12px' }}
                  onClick={() => setIsEditing(true)}
                >
                  Edit Name
                </button>
              )}
            </div>

            {/* Account info */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px', fontFamily: 'var(--font-display)' }}>
                Account Info
              </div>

              <div style={rowStyle}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>Credits Balance</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>
                  {profile?.credits ?? 0}
                </span>
              </div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>Member Since</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)', fontFamily: 'var(--font-display)' }}>
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

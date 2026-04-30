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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading profile...</div>
        ) : (
          <>
            <div className="profile-card">
              <div className="card-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>Profile Details</div>
              <div className="profile-header" style={{ marginTop: '16px' }}>
                <div className="profile-avatar">{initial}</div>
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          border: '2px solid var(--teal)',
                          borderRadius: '8px',
                          fontFamily: 'var(--font-body)',
                          fontSize: '16px',
                          fontWeight: 700,
                          outline: 'none',
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
                          className="btn-outline-small"
                          onClick={() => { setIsEditing(false); setEditName(profile?.full_name || ''); }}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2>{profile?.full_name || 'Unnamed User'}</h2>
                      <p>{profile?.email || 'No email'}</p>
                    </>
                  )}
                </div>
              </div>
              {!isEditing && (
                <button
                  className="btn-outline-small"
                  style={{ width: '100%', marginTop: '16px' }}
                  onClick={() => setIsEditing(true)}
                >
                  Edit Profile
                </button>
              )}
            </div>

            <div className="profile-card" style={{ marginTop: '24px' }}>
              <div className="card-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>Account Info</div>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: '#666', fontWeight: 600 }}>Credits Balance</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--teal)' }}>{profile?.credits ?? 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <span style={{ fontSize: '13px', color: '#666', fontWeight: 600 }}>Member Since</span>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

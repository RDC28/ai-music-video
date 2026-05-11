'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardNav from '@/components/DashboardNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

export default function DashboardScreen() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [userName, setUserName] = useState('');
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchProjects = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const meta = user.user_metadata?.full_name;
      if (meta) setUserName(meta.split(' ')[0]);
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
      if (data) setProjects(data);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProjects();
  }, [fetchProjects]);

  const handleDelete = async (e, projectId) => {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      'Delete this project and its media files? This cannot be undone.'
    );

    if (confirmed) {
      try {
        const { data: files } = await supabase.storage
          .from('assets')
          .list(projectId);

        if (files && files.length > 0) {
          const filesToRemove = files.map((f) => `${projectId}/${f.name}`);
          await supabase.storage.from('assets').remove(filesToRemove);
        }

        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', projectId);

        if (error) throw error;

        setProjects(projects.filter(p => p.id !== projectId));
      } catch {
        alert('Project could not be deleted. Please try again.');
      }
    }
  };

  const startNewProject = async (e) => {
    if (e) e.preventDefault();

    if (!newProjectTitle.trim()) {
      alert('Please enter a project title');
      return;
    }

    setIsCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please sign in first.');
      setIsCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        user_id: user.id,
        title: newProjectTitle.trim()
      }])
      .select()
      .single();

    if (data) {
      localStorage.setItem('activeScreen', '1');
      router.push(`/create/${data.id}`);
    } else {
      console.error('Error creating project:', error);
      alert('Project could not be created. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="dashboard-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <DashboardNav />

      <main
        style={{
          padding: '56px 56px 80px',
          maxWidth: '1240px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Hero header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '24px',
            marginBottom: '40px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ maxWidth: '620px' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--cyan)',
                marginBottom: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ width: '20px', height: '1px', background: 'linear-gradient(90deg, transparent, var(--cyan))' }} />
              {userName ? `Studio · ${userName}` : 'Studio'}
            </div>
            <h1 className="dashboard-greeting">
              {userName ? <>Hello, <em>{userName}.</em></> : <em>Welcome.</em>}
            </h1>
            <p className="dashboard-sub">
              Your projects live here. Open one to keep building, or start a fresh visual world from a song.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            disabled={isCreating}
            className="btn-primary"
            style={{ fontSize: '13px', padding: '12px 26px' }}
          >
            {isCreating ? 'Creating…' : '＋  New project'}
          </button>
        </header>

        {/* Section header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {isLoading
              ? 'Loading library…'
              : `${String(projects.length).padStart(2, '0')} ${projects.length === 1 ? 'project' : 'projects'} · in motion`}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: '14px',
              color: 'var(--text-soft)',
              letterSpacing: '-0.015em',
            }}
          >
            Library
          </div>
        </div>

        {/* Project grid */}
        {isLoading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '22px',
            }}
          >
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xl)',
                  overflow: 'hidden',
                  height: '236px',
                  opacity: 0.5,
                  animation: 'panelRise 420ms var(--ease-premium) both',
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '22px',
            }}
          >
            {projects.map((project, idx) => (
              <div
                key={project.id}
                style={{
                  position: 'relative',
                  animation: 'panelRise 480ms var(--ease-premium) both',
                  animationDelay: `${idx * 50}ms`,
                }}
                onMouseOver={e => e.currentTarget.querySelector('[data-delete]').style.opacity = '1'}
                onMouseOut={e => e.currentTarget.querySelector('[data-delete]').style.opacity = '0'}
              >
                <Link
                  href={`/create/${project.id}`}
                  onClick={() => localStorage.setItem('activeScreen', '1')}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div className="project-card-new">
                    <div
                      className={project.status === 'completed' ? 'project-card-thumb' : 'project-card-thumb'}
                      style={
                        project.status === 'completed'
                          ? {
                              backgroundImage:
                                'radial-gradient(ellipse 80% 80% at 30% 30%, rgba(124,58,237,0.36), transparent 60%), radial-gradient(ellipse 60% 70% at 80% 70%, rgba(236,72,153,0.28), transparent 64%), linear-gradient(135deg, #0C0C18, #0A0A12)',
                            }
                          : undefined
                      }
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: '18px',
                          top: '16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9.5px',
                          fontWeight: 500,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: 'rgba(236,238,242,0.66)',
                          background: 'rgba(8,10,14,0.5)',
                          backdropFilter: 'blur(8px)',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          zIndex: 1,
                        }}
                      >
                        {project.status === 'completed' ? '● Released' : '○ In flight'}
                      </div>
                    </div>
                    <div style={{ padding: '20px 22px 22px', position: 'relative', zIndex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: '20px',
                          fontWeight: 500,
                          color: 'var(--dark)',
                          marginBottom: '8px',
                          letterSpacing: '-0.022em',
                          lineHeight: 1.15,
                        }}
                      >
                        {project.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.06em',
                        }}
                      >
                        Updated {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </Link>

                <button
                  data-delete
                  onClick={(e) => handleDelete(e, project.id)}
                  style={{
                    position: 'absolute',
                    top: '14px',
                    right: '14px',
                    background: 'rgba(255, 70, 70, 0.86)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 2,
                    fontSize: '15px',
                    opacity: '0',
                    transition: 'opacity 0.18s, transform 0.3s var(--ease-spring)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 8px 22px rgba(255,70,70,0.32)',
                  }}
                  onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.08)')}
                  onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                  title="Delete project"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)), var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-2xl)',
              padding: '88px 48px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '22px',
              boxShadow: 'var(--shadow-card)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                width: '420px',
                height: '420px',
                top: '-80px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'radial-gradient(circle, rgba(124,58,237,0.14), transparent 64%)',
                filter: 'blur(40px)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(124,58,237,0.16), rgba(109,40,217,0.04))',
                border: '1px solid rgba(124,58,237,0.28)',
                boxShadow: '0 16px 40px rgba(124,58,237,0.18)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--violet)' }}>
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontSize: '28px',
                  fontWeight: 500,
                  color: 'var(--dark)',
                  marginBottom: '10px',
                  letterSpacing: '-0.025em',
                }}
              >
                Nothing here yet.
              </div>
              <div
                style={{
                  fontSize: '13.5px',
                  color: 'var(--text-muted)',
                  maxWidth: '380px',
                  margin: '0 auto',
                  lineHeight: 1.65,
                }}
              >
                Bring a song, an idea, or a half-formed image. The studio takes it from there.
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              disabled={isCreating}
              className="btn-primary"
              style={{ fontSize: '13px', position: 'relative', zIndex: 1 }}
            >
              {isCreating ? 'Creating…' : 'Create your first video'}
            </button>
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showModal && (
        <div className="auth-overlay" onClick={() => setShowModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowModal(false)}>×</button>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--cyan)',
                marginBottom: '12px',
              }}
            >
              ── New world
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: '28px',
                fontWeight: 500,
                color: 'var(--dark)',
                marginBottom: '24px',
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
              }}
            >
              Name the project.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Project Title
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. After Hours Visual"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-mid)',
                    fontSize: '15px',
                    outline: 'none',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    letterSpacing: '-0.015em',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.18s, box-shadow 0.18s, background 0.18s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(124,58,237,0.5)';
                    e.target.style.boxShadow = '0 0 0 4px rgba(124,58,237,0.08)';
                    e.target.style.background = 'rgba(255,255,255,0.058)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-mid)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && startNewProject()}
                />
              </div>
              <button
                className="btn-primary"
                onClick={startNewProject}
                disabled={isCreating || !newProjectTitle.trim()}
                style={{ padding: '14px', width: '100%', justifyContent: 'center' }}
              >
                {isCreating ? 'Creating project…' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

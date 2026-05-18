'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardNav from '@/components/DashboardNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { modalOverlay, modalContent, listItemStagger, listItem } from '@/lib/motion';
import { Plus, X, Film, Clock } from 'lucide-react';

const PROJECT_COLORS = [
  ['var(--ink-900)', 'var(--ink-800)'],
  ['var(--ink-950)', 'var(--ink-800)'],
  ['var(--violet-500)', 'var(--ink-800)'],
  ['var(--ink-800)', 'var(--ink-900)'],
  ['var(--ink-900)', 'var(--violet-500)'],
  ['var(--ink-950)', 'var(--violet-400)'],
];

export default function DashboardScreen() {
  const [projects, setProjects]               = useState([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [isCreating, setIsCreating]           = useState(false);
  const [showModal, setShowModal]             = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [userName, setUserName]               = useState('');
  const supabase                              = useMemo(() => createClient(), []);
  const router                                = useRouter();
  const projectGridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '18px',
    alignItems: 'start',
  }), []);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchProjects(); }, [fetchProjects]);

  const handleDelete = async (e, projectId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this project and its media files? This cannot be undone.')) return;
    try {
      const { data: files } = await supabase.storage.from('assets').list(projectId);
      if (files?.length > 0) {
        await supabase.storage.from('assets').remove(files.map(f => `${projectId}/${f.name}`));
      }
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch {
      alert('Project could not be deleted. Please try again.');
    }
  };

  const startNewProject = async (e) => {
    if (e) e.preventDefault();
    if (!newProjectTitle.trim()) { alert('Please enter a project title'); return; }
    setIsCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('Please sign in first.'); setIsCreating(false); return; }
    const { data, error } = await supabase
      .from('projects')
      .insert([{ user_id: user.id, title: newProjectTitle.trim() }])
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DashboardNav />

      <main style={{ flex: 1, padding: '48px 40px 80px', maxWidth: '1460px', margin: '0 auto', width: '100%' }}>

        {/* Asymmetric hero — title left, action right but offset down */}
        <header style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'start',
          gap: '32px',
          marginBottom: '48px',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--cyan)',
              marginBottom: '16px',
            }}>
              ▪ Studio
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: '700',
              color: 'var(--text)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              marginBottom: '12px',
            }}>
              {userName ? <>Hello, <span style={{ color: 'var(--cyan)' }}>{userName}.</span></> : 'Your projects.'}
            </h1>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14.5px',
              color: 'var(--text-soft)',
              lineHeight: 1.65,
              maxWidth: '460px',
            }}>
              Open a project to keep building, or start fresh from a new song.
            </p>
          </div>

          {/* New project button — offset lower for asymmetry */}
          <div style={{ paddingTop: '48px' }}>
            <button
              className="btn-primary"
              onClick={() => setShowModal(true)}
              disabled={isCreating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
              }}
            >
              <Plus size={14} />
              New project
            </button>
          </div>
        </header>

        {/* Section label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-soft)',
          }}>
            {isLoading
              ? 'Loading…'
              : `${String(projects.length).padStart(2, '0')} ${projects.length === 1 ? 'project' : 'projects'}`}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-soft)',
            letterSpacing: '0.08em',
          }}>
            Library
          </span>
        </div>

        {/* Skeleton loaders */}
        {isLoading && (
          <div style={projectGridStyle}>
            {[180, 220, 160, 200, 180].map((h, i) => (
              <div key={i} style={{
                height: `${h}px`,
                background: 'var(--surface-2)',
                boxShadow: 'var(--neo-flat)',
                borderRadius: 'var(--radius-lg)',
                opacity: 0.5,
                animation: `pulse 1.8s ease-in-out ${i * 120}ms infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Project masonry grid */}
        {!isLoading && projects.length > 0 && (
          <motion.div
            variants={listItemStagger}
            initial="hidden"
            animate="visible"
            style={projectGridStyle}
          >
            {projects.map((project, idx) => {
              const [bg1, bg2] = PROJECT_COLORS[idx % PROJECT_COLORS.length];
              return (
                <motion.div
                  key={project.id}
                  variants={listItem}
                  style={{ position: 'relative' }}
                  onMouseEnter={e => {
                    const btn = e.currentTarget.querySelector('[data-delete]');
                    if (btn) btn.style.opacity = '1';
                  }}
                  onMouseLeave={e => {
                    const btn = e.currentTarget.querySelector('[data-delete]');
                    if (btn) btn.style.opacity = '0';
                  }}
                >
                  <Link
                    href={`/create/${project.id}`}
                    onClick={() => localStorage.setItem('activeScreen', '1')}
                    style={{ textDecoration: 'none', display: 'block' }}
                  >
                    <div style={{
                      background: 'var(--surface-2)',
                      boxShadow: 'var(--neo-raised)',
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      transition: 'box-shadow 200ms ease-out, border-color 200ms ease-out',
                    }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = 'var(--neo-active)';
                        e.currentTarget.style.borderColor = 'var(--cyan-border)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = 'var(--neo-raised)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        height: '120px',
                        background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundImage: 'radial-gradient(circle, rgba(var(--cyan-rgb), 0.06) 1px, transparent 1px)',
                          backgroundSize: '20px 20px',
                        }} />
                        <div style={{
                          position: 'absolute',
                          bottom: '10px',
                          left: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: '700',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: project.status === 'completed' ? 'var(--success)' : 'var(--text-muted)',
                        }}>
                          <span style={{
                            width: '5px', height: '5px', borderRadius: '50%',
                            background: project.status === 'completed' ? 'var(--success)' : 'var(--border-mid)',
                          }} />
                          {project.status === 'completed' ? 'Complete' : 'In progress'}
                        </div>
                        <Film size={20} color="rgba(var(--cyan-rgb), 0.12)" style={{
                          position: 'absolute', top: '12px', right: '12px',
                        }} />
                      </div>

                      {/* Info */}
                      <div style={{ padding: '16px 18px 18px' }}>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '16px',
                          fontWeight: '700',
                          color: 'var(--text)',
                          letterSpacing: '-0.02em',
                          lineHeight: 1.2,
                          marginBottom: '8px',
                        }}>
                          {project.title}
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-soft)',
                          letterSpacing: '0.04em',
                        }}>
                          <Clock size={10} />
                          {new Date(project.updated_at).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Delete button */}
                  <button
                    data-delete=""
                    onClick={(e) => handleDelete(e, project.id)}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'rgba(var(--violet-rgb), 0.9)',
                      border: 'none',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: '0',
                      transition: 'opacity 160ms ease-out',
                      zIndex: 2,
                    }}
                    title="Delete project"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Empty state */}
        {!isLoading && projects.length === 0 && (
          <div style={{
            background: 'var(--surface-2)',
            boxShadow: 'var(--neo-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '80px 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'var(--surface)',
              boxShadow: 'var(--neo-raised)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Film size={22} color="var(--cyan)" />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                fontWeight: '700',
                color: 'var(--text)',
                letterSpacing: '-0.025em',
                marginBottom: '8px',
              }}>
                Nothing here yet.
              </div>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-soft)',
                lineHeight: 1.6,
                maxWidth: '340px',
              }}>
                Bring a song and an idea. The studio takes it from there.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => setShowModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
              }}
            >
              <Plus size={14} />
              Create your first video
            </button>
          </div>
        )}
      </main>

      {/* New project modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            key="modal-overlay"
            variants={modalOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(var(--ink-950-rgb), 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 200,
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              variants={modalContent}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface-2)',
                boxShadow: 'var(--shadow-modal)',
                border: '1px solid var(--border-mid)',
                borderRadius: 'var(--radius-xl)',
                padding: '32px',
                width: '100%',
                maxWidth: '420px',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--neo-flat)',
                  color: 'var(--text-soft)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={13} />
              </button>

              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--cyan)',
                marginBottom: '12px',
              }}>
                ▪ New project
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '26px',
                fontWeight: '700',
                color: 'var(--text)',
                letterSpacing: '-0.025em',
                lineHeight: 1.1,
                marginBottom: '28px',
              }}>
                Name the project.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: 'var(--text-soft)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '6px',
                }}>
                  Title
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. After Hours Visual"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startNewProject()}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    background: 'var(--bg-deep)',
                    boxShadow: 'var(--neo-inset)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: '15px',
                    fontFamily: 'var(--font-display)',
                    fontWeight: '600',
                    color: 'var(--text)',
                    letterSpacing: '-0.015em',
                    outline: 'none',
                    transition: 'border-color 160ms ease-out',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
                <button
                  className="btn-primary"
                  onClick={startNewProject}
                  disabled={isCreating || !newProjectTitle.trim()}
                  style={{
                    padding: '13px',
                    width: '100%',
                    cursor: isCreating || !newProjectTitle.trim() ? 'not-allowed' : 'pointer',
                    opacity: isCreating || !newProjectTitle.trim() ? 0.5 : 1,
                    transition: 'opacity 160ms ease-out',
                    marginTop: '4px',
                  }}
                >
                  {isCreating ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

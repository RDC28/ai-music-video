'use client';

import { useState, useEffect } from 'react';
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
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
      if (data) setProjects(data);
    }
    setIsLoading(false);
  };

  const handleDelete = async (e, projectId) => {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      "Are you sure you want to delete this project? This action is PERMANENT and will delete all associated audio and video files."
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
      } catch (err) {
        alert("Failed to delete project: " + err.message);
      }
    }
  };

  const startNewProject = async (e) => {
    if (e) e.preventDefault();

    if (!newProjectTitle.trim()) {
      alert("Please enter a project title");
      return;
    }

    setIsCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Please login first");
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
      console.error("Error creating project:", error);
      alert("Failed to create project. Please try again.");
      setIsCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <DashboardNav />

      <main style={{ padding: '40px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '4px' }}>
              Your Projects
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isLoading ? 'Loading...' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={isCreating}
            className="btn-teal"
            style={{ fontSize: '12px', padding: '8px 18px' }}
          >
            {isCreating ? 'Creating...' : '+ New Project'}
          </button>
        </div>

        {/* Project grid */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', height: '200px', opacity: 0.5 }} />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {projects.map((project) => (
              <div
                key={project.id}
                style={{ position: 'relative' }}
                onMouseOver={e => e.currentTarget.querySelector('[data-delete]').style.opacity = '1'}
                onMouseOut={e => e.currentTarget.querySelector('[data-delete]').style.opacity = '0'}
              >
                <Link
                  href={`/create/${project.id}`}
                  onClick={() => localStorage.setItem('activeScreen', '1')}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s',
                  }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(0,229,255,0.2)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{
                      height: '140px',
                      background: `linear-gradient(135deg, #1A0A1A, ${project.status === 'completed' ? '#1a3a30' : '#2a1205'})`,
                    }} />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--dark)', marginBottom: '4px', letterSpacing: '-0.01em' }}>
                        {project.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Updated {new Date(project.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>

                <button
                  data-delete
                  onClick={(e) => handleDelete(e, project.id)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(255, 60, 60, 0.85)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 2,
                    fontSize: '14px',
                    opacity: '0',
                    transition: 'opacity 0.15s',
                    backdropFilter: 'blur(4px)',
                  }}
                  title="Delete Project"
                >×</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '60px 40px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, color: 'var(--dark)' }}>
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark)', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>No projects yet</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Create your first music video to get started</div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              disabled={isCreating}
              className="btn-orange"
              style={{ fontSize: '12px' }}
            >
              {isCreating ? 'Creating...' : 'Create Your First Video'}
            </button>
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showModal && (
        <div className="auth-overlay" onClick={() => setShowModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowModal(false)}>×</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--dark)', marginBottom: '20px' }}>
              New Project
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  Project Title
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. My Epic Music Video"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-mid)',
                    fontSize: '14px',
                    outline: 'none',
                    background: 'var(--surface)',
                    color: 'var(--dark)',
                    fontFamily: 'var(--font-body)',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
                  onKeyDown={(e) => e.key === 'Enter' && startNewProject()}
                />
              </div>
              <button
                className="btn-orange"
                onClick={startNewProject}
                disabled={isCreating || !newProjectTitle.trim()}
                style={{ padding: '12px', width: '100%' }}
              >
                {isCreating ? 'Creating...' : 'Start Creation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

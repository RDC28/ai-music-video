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
        // 1. Storage Cleanup: Delete all files in the project folder
        const { data: files } = await supabase.storage
          .from('assets')
          .list(projectId);

        if (files && files.length > 0) {
          const filesToRemove = files.map((f) => `${projectId}/${f.name}`);
          await supabase.storage.from('assets').remove(filesToRemove);
        }

        // 2. Database Cleanup: Delete the project row
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', projectId);

        if (error) throw error;

        // 3. UI Update
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <DashboardNav />

      <main style={{ padding: '48px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div className="profile-card projects-card">
          <div className="projects-header">
            <div className="card-title">Your Projects</div>
            <button 
              onClick={() => setShowModal(true)}
              disabled={isCreating}
              className="btn-teal" 
              style={{ padding: '8px 16px', fontSize: '12px', border: 'none', cursor: isCreating ? 'wait' : 'pointer' }}
            >
              {isCreating ? 'Creating...' : '+ New Project'}
            </button>
          </div>
          
          <div className="projects-grid">
            {isLoading ? (
              <div style={{ padding: '20px', color: '#666' }}>Loading your masterpieces...</div>
            ) : projects.length > 0 ? (
              projects.map((project) => (
                <div key={project.id} style={{ position: 'relative' }}>
                  <Link 
                    href={`/create/${project.id}`} 
                    onClick={() => localStorage.setItem('activeScreen', '1')}
                    style={{ textDecoration: 'none' }} 
                    className="project-item"
                  >
                    <div className="project-thumb">
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        background: `linear-gradient(45deg, #1A0A1A, ${project.status === 'completed' ? '#3D8C7A' : '#F05A28'})` 
                      }} />
                    </div>
                    <div className="project-info">
                      <strong>{project.title}</strong>
                      <span>Last updated: {new Date(project.updated_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                  
                  <button 
                    onClick={(e) => handleDelete(e, project.id)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(255, 77, 77, 0.9)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 2,
                      fontSize: '14px',
                    }}
                    title="Delete Project"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1' }}>
                <p style={{ color: '#666', marginBottom: '16px' }}>You haven&apos;t created any projects yet.</p>
                <button onClick={() => setShowModal(true)} disabled={isCreating} className="btn-orange" style={{ padding: '10px 20px', border: 'none', cursor: 'pointer' }}>
                  {isCreating ? 'Creating...' : 'Create your first video'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* New Project Modal */}
      {showModal && (
        <div className="auth-overlay" onClick={() => setShowModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowModal(false)}>×</button>
            <div className="card-title">New Project</div>
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#666' }}>PROJECT TITLE</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g. My Epic Music Video"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '2px solid var(--border)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && startNewProject()}
                />
              </div>
              <button 
                className="btn-orange" 
                onClick={startNewProject}
                disabled={isCreating || !newProjectTitle.trim()}
                style={{ padding: '12px' }}
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

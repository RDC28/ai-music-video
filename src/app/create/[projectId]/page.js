'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import TopBar from '@/components/TopBar';
import LandingScreen from '@/components/screens/LandingScreen';
import UploadAudioScreen from '@/components/screens/UploadAudioScreen';
import BrainDumpScreen from '@/components/screens/BrainDumpScreen';
import CharactersScreen from '@/components/screens/CharactersScreen';
import LocationsScreen from '@/components/screens/LocationsScreen';
import GenerateShotListScreen from '@/components/screens/GenerateShotListScreen';
import ShotListScreen from '@/components/screens/ShotListScreen';
import ImagesScreen from '@/components/screens/ImagesScreen';
import VideosScreen from '@/components/screens/VideosScreen';
import AssembleScreen from '@/components/screens/AssembleScreen';

export default function CreateProject({ params }) {
  const { projectId } = use(params);
  const [activeScreen, setActiveScreen] = useState(() => {
    if (typeof window === 'undefined') return 1;
    return Number(localStorage.getItem('activeScreen')) || 1;
  });
  const [projectData, setProjectData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchData = useCallback(async (id) => {
    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (projectError || !project) {
      console.error("Project not found or access denied");
      router.push('/dashboard');
      return;
    }

    setProjectData(project);

    // Fetch profile
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(prof);
    }

    setIsInitialLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    if (projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData(projectId);
    }
  }, [fetchData, projectId]);

  const goTo = (n) => {
    setActiveScreen(n);
    localStorage.setItem('activeScreen', n);
  };

  const updateProjectData = async (updates) => {
    if (!projectId) return;
    
    const { error } = await supabase
      .from('projects')
      .update({ project_state: { ...projectData?.project_state, ...updates } })
      .eq('id', projectId);
    
    if (!error) {
      setProjectData(prev => ({
        ...prev,
        project_state: { ...prev?.project_state, ...updates }
      }));
    }
  };

  if (isInitialLoading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)', color: 'var(--teal)', fontWeight: 700 }}>Validating Project Session...</div>;
  }

  const userName = profile?.full_name?.split(' ')[0]?.toUpperCase() || 'USER';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <TopBar activeScreen={activeScreen} onNavigate={goTo} userName={userName} projectName={projectData?.title} />

      <main className="workflow-shell">
      {activeScreen === 1 && <LandingScreen onNavigate={goTo} userName={userName} />}
      {activeScreen === 2 && (
        <UploadAudioScreen 
          onNavigate={goTo} 
          projectId={projectId} 
          existingAudioUrl={projectData?.audio_url}
          projectState={projectData?.project_state}
          onUploadSuccess={() => fetchData(projectId)}
        />
      )}
      {activeScreen === 3 && (
        <BrainDumpScreen 
          onNavigate={goTo} 
          projectId={projectId}
          projectState={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 4 && (
        <CharactersScreen 
          onNavigate={goTo} 
          projectId={projectId}
          projectData={projectData?.project_state?.characters}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 5 && (
        <LocationsScreen 
          onNavigate={goTo} 
          projectId={projectId}
          projectData={projectData?.project_state?.locations}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 6 && (
        <GenerateShotListScreen 
          onNavigate={goTo} 
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 7 && (
        <ShotListScreen 
          onNavigate={goTo} 
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 8 && (
        <ImagesScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 8} 
          projectId={projectId}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 9 && (
        <VideosScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 9}
          projectId={projectId}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 10 && (
        <AssembleScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 10} 
          audioUrl={projectData?.audio_url}
          projectData={projectData?.project_state}
        />
      )}
      </main>
    </div>
  );
}

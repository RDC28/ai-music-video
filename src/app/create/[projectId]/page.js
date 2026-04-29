'use client';

import { useState, useEffect, use } from 'react';
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
  const [activeScreen, setActiveScreen] = useState(1);
  const [projectData, setProjectData] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
    
    const savedScreen = localStorage.getItem('activeScreen');
    if (savedScreen) {
      setActiveScreen(Number(savedScreen));
    }
  }, [projectId]);

  const fetchProject = async (id) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error("Project not found or access denied");
      router.push('/dashboard');
      return;
    }

    setProjectData(data);
    setIsInitialLoading(false);
  };

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar activeScreen={activeScreen} onNavigate={goTo} />

      {activeScreen === 1 && <LandingScreen onNavigate={goTo} />}
      {activeScreen === 2 && (
        <UploadAudioScreen 
          onNavigate={goTo} 
          projectId={projectId} 
          existingAudioUrl={projectData?.audio_url}
          onUploadSuccess={(url) => setProjectData(prev => ({ ...prev, audio_url: url }))}
        />
      )}
      {activeScreen === 3 && (
        <BrainDumpScreen 
          onNavigate={goTo} 
          projectId={projectId}
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
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 6 && <GenerateShotListScreen onNavigate={goTo} />}
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
          projectData={projectData?.project_state?.shot_list || []}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 9 && (
        <VideosScreen onNavigate={goTo} isActive={activeScreen === 9} />
      )}
      {activeScreen === 10 && (
        <AssembleScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 10} 
          audioUrl={projectData?.audio_url}
          projectData={projectData?.project_state}
        />
      )}
    </div>
  );
}

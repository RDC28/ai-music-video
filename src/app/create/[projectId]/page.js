'use client';

import { useState, useEffect, use, useCallback, useMemo, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import StageRail from '@/components/StageRail';
import WorkflowBuffer from '@/components/WorkflowBuffer';

const SCREEN_META = {
  1: { name: 'Home', title: 'Opening home' },
  2: { name: 'Audio', title: 'Preparing audio' },
  3: { name: 'Story', title: 'Preparing story' },
  4: { name: 'Cast', title: 'Preparing cast' },
  5: { name: 'Locations', title: 'Preparing locations' },
  6: { name: 'Wardrobe', title: 'Preparing wardrobe' },
  7: { name: 'Shot plan', title: 'Preparing shot plan' },
  8: { name: 'Shots', title: 'Preparing shots' },
  9: { name: 'Frames', title: 'Preparing frames' },
  10: { name: 'Clips', title: 'Preparing clips' },
  11: { name: 'Editor', title: 'Preparing editor' },
};

const screenFallback = (id) => function ScreenFallback() {
  const meta = SCREEN_META[id] || SCREEN_META[1];
  return (
    <WorkflowBuffer
      title={meta.title}
      message="A moment while this view comes into focus."
    />
  );
};

const LandingScreen = dynamic(() => import('@/components/screens/LandingScreen'), { loading: screenFallback(1) });
const UploadAudioScreen = dynamic(() => import('@/components/screens/UploadAudioScreen'), { loading: screenFallback(2) });
const BrainDumpScreen = dynamic(() => import('@/components/screens/BrainDumpScreen'), { loading: screenFallback(3) });
const CharactersScreen = dynamic(() => import('@/components/screens/CharactersScreen'), { loading: screenFallback(4) });
const LocationsScreen = dynamic(() => import('@/components/screens/LocationsScreen'), { loading: screenFallback(5) });
const WardrobeScreen = dynamic(() => import('@/components/screens/WardrobeScreen'), { loading: screenFallback(6) });
const GenerateShotListScreen = dynamic(() => import('@/components/screens/GenerateShotListScreen'), { loading: screenFallback(7) });
const ShotListScreen = dynamic(() => import('@/components/screens/ShotListScreen'), { loading: screenFallback(8) });
const ImagesScreen = dynamic(() => import('@/components/screens/ImagesScreen'), { loading: screenFallback(9) });
const VideosScreen = dynamic(() => import('@/components/screens/VideosScreen'), { loading: screenFallback(10) });
const AssembleScreen = dynamic(() => import('@/components/screens/AssembleScreen'), { loading: screenFallback(11) });

const prefetchScreenModule = (id) => {
  switch (id) {
    case 1: return import('@/components/screens/LandingScreen');
    case 2: return import('@/components/screens/UploadAudioScreen');
    case 3: return import('@/components/screens/BrainDumpScreen');
    case 4: return import('@/components/screens/CharactersScreen');
    case 5: return import('@/components/screens/LocationsScreen');
    case 6: return import('@/components/screens/WardrobeScreen');
    case 7: return import('@/components/screens/GenerateShotListScreen');
    case 8: return import('@/components/screens/ShotListScreen');
    case 9: return import('@/components/screens/ImagesScreen');
    case 10: return import('@/components/screens/VideosScreen');
    case 11: return import('@/components/screens/AssembleScreen');
    default: return Promise.resolve();
  }
};

export default function CreateProject({ params }) {
  const { projectId } = use(params);
  const [activeScreen, setActiveScreen] = useState(() => {
    if (typeof window === 'undefined') return 1;
    return Number(localStorage.getItem('activeScreen')) || 1;
  });
  const [projectData, setProjectData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isScreenPreparing, setIsScreenPreparing] = useState(false);
  const [preparingTarget, setPreparingTarget] = useState(activeScreen);
  const [isPending, startTransition] = useTransition();
  
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

  useEffect(() => {
    if (isInitialLoading) return;

    const nextScreens = [activeScreen + 1, activeScreen + 2]
      .filter(screen => screen >= 1 && screen <= 11);
    if (!nextScreens.length) return;

    const run = () => {
      nextScreens.forEach(screen => {
        prefetchScreenModule(screen).catch(() => {});
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(run, 500);
    return () => window.clearTimeout(timeoutId);
  }, [activeScreen, isInitialLoading]);

  useEffect(() => {
    if (!isScreenPreparing) return;
    const timeoutId = window.setTimeout(() => setIsScreenPreparing(false), 420);
    return () => window.clearTimeout(timeoutId);
  }, [activeScreen, isScreenPreparing]);

  const goTo = useCallback((n) => {
    const nextScreen = Math.min(11, Math.max(1, Number(n) || 1));
    if (nextScreen === activeScreen) return;

    setPreparingTarget(nextScreen);
    setIsScreenPreparing(true);
    localStorage.setItem('activeScreen', nextScreen);
    startTransition(() => {
      setActiveScreen(nextScreen);
    });
  }, [activeScreen, startTransition]);

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
    return (
      <div className="workflow-app-loading" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
        <main className="workflow-shell" style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column' }}>
          <WorkflowBuffer
            title="Opening your project"
            message="Bringing your latest work into view."
          />
        </main>
      </div>
    );
  }

  const userName = profile?.full_name?.split(' ')[0]?.toUpperCase() || 'USER';
  const preparingMeta = SCREEN_META[preparingTarget] || SCREEN_META[activeScreen] || SCREEN_META[1];
  const showPreparingOverlay = isScreenPreparing || isPending;

  return (
    <div className="workflow-app">
      <StageRail activeScreen={activeScreen} onNavigate={goTo} userName={userName} projectName={projectData?.title} />

      <main className="workflow-shell">
      {activeScreen === 1 && <LandingScreen onNavigate={goTo} userName={userName} />}
      {activeScreen === 2 && (
        <UploadAudioScreen 
          onNavigate={goTo} 
          projectId={projectId} 
          existingAudioUrl={projectData?.audio_url}
          projectState={projectData?.project_state}
          onDataUpdate={updateProjectData}
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
          projectState={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 5 && (
        <LocationsScreen 
          onNavigate={goTo} 
          projectId={projectId}
          projectData={projectData?.project_state?.locations}
          projectState={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 6 && (
        <WardrobeScreen
          onNavigate={goTo}
          projectId={projectId}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 7 && (
        <GenerateShotListScreen 
          onNavigate={goTo} 
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 8 && (
        <ShotListScreen 
          onNavigate={goTo} 
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 9 && (
        <ImagesScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 9} 
          projectId={projectId}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 10 && (
        <VideosScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 10}
          projectId={projectId}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {activeScreen === 11 && (
        <AssembleScreen 
          onNavigate={goTo} 
          isActive={activeScreen === 11} 
          projectId={projectId}
          audioUrl={projectData?.audio_url}
          projectData={projectData?.project_state}
          onDataUpdate={updateProjectData}
        />
      )}
      {showPreparingOverlay && (
        <WorkflowBuffer
          variant="overlay"
          title={`Preparing ${preparingMeta.name}`}
          message="A moment while this view comes into focus."
        />
      )}
      </main>
    </div>
  );
}

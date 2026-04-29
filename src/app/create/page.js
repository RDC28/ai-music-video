'use client';

import { useState, useEffect } from 'react';
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

export default function CreateProject() {
  const [activeScreen, setActiveScreen] = useState(1);

  useEffect(() => {
    const savedScreen = localStorage.getItem('activeScreen');
    if (savedScreen) {
      setActiveScreen(Number(savedScreen));
    }
  }, []);

  const goTo = (n) => {
    setActiveScreen(n);
    localStorage.setItem('activeScreen', n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar activeScreen={activeScreen} onNavigate={goTo} />

      {activeScreen === 1 && <LandingScreen onNavigate={goTo} />}
      {activeScreen === 2 && <UploadAudioScreen onNavigate={goTo} />}
      {activeScreen === 3 && <BrainDumpScreen onNavigate={goTo} />}
      {activeScreen === 4 && <CharactersScreen onNavigate={goTo} />}
      {activeScreen === 5 && <LocationsScreen onNavigate={goTo} />}
      {activeScreen === 6 && <GenerateShotListScreen onNavigate={goTo} />}
      {activeScreen === 7 && <ShotListScreen onNavigate={goTo} />}
      {activeScreen === 8 && (
        <ImagesScreen onNavigate={goTo} isActive={activeScreen === 8} />
      )}
      {activeScreen === 9 && (
        <VideosScreen onNavigate={goTo} isActive={activeScreen === 9} />
      )}
      {activeScreen === 10 && (
        <AssembleScreen onNavigate={goTo} isActive={activeScreen === 10} />
      )}
    </div>
  );
}

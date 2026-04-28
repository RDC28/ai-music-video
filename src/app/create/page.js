'use client';

import { useState } from 'react';
import NavDots from '@/components/NavDots';
import LandingScreen from '@/components/screens/LandingScreen';
import UploadAudioScreen from '@/components/screens/UploadAudioScreen';
import BrainDumpScreen from '@/components/screens/BrainDumpScreen';
import CharactersScreen from '@/components/screens/CharactersScreen';
import GenerateShotListScreen from '@/components/screens/GenerateShotListScreen';
import ShotListScreen from '@/components/screens/ShotListScreen';
import ImagesScreen from '@/components/screens/ImagesScreen';
import VideosScreen from '@/components/screens/VideosScreen';
import AssembleScreen from '@/components/screens/AssembleScreen';

export default function CreateProject() {
  const [activeScreen, setActiveScreen] = useState(1);

  const goTo = (n) => {
    setActiveScreen(n);
  };

  return (
    <>
      <NavDots activeScreen={activeScreen} onNavigate={goTo} />

      {activeScreen === 1 && <LandingScreen onNavigate={goTo} />}
      {activeScreen === 2 && <UploadAudioScreen onNavigate={goTo} />}
      {activeScreen === 3 && <BrainDumpScreen onNavigate={goTo} />}
      {activeScreen === 4 && <CharactersScreen onNavigate={goTo} />}
      {activeScreen === 5 && <GenerateShotListScreen onNavigate={goTo} />}
      {activeScreen === 6 && <ShotListScreen onNavigate={goTo} />}
      {activeScreen === 7 && (
        <ImagesScreen onNavigate={goTo} isActive={activeScreen === 7} />
      )}
      {activeScreen === 8 && (
        <VideosScreen onNavigate={goTo} isActive={activeScreen === 8} />
      )}
      {activeScreen === 9 && (
        <AssembleScreen onNavigate={goTo} isActive={activeScreen === 9} />
      )}
    </>
  );
}

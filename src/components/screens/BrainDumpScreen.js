import { useEffect, useMemo, useState } from 'react';
import { Mic2 } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';
import BrainStatusPanel from './brain-dump/BrainStatusPanel';
import EntityVibesTab from './brain-dump/EntityVibesTab';
import ScriptThemeTab from './brain-dump/ScriptThemeTab';
import { BRAIN_TABS } from './brain-dump/brainDumpConstants';
import {
  buildUploadPath,
  cleanText,
  deriveBrainDumpForm,
  deriveMoodWords,
  splitList,
  safeFileName,
  serializeCharacters,
  serializeLocations,
  uniqueList,
} from './brain-dump/brainDumpUtils';

export default function BrainDumpScreen({ onNavigate, onDataUpdate, projectId, projectState }) {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState('script');
  const [form, setForm] = useState(() => deriveBrainDumpForm(projectState));
  const [savingTab, setSavingTab] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [brainDumpError, setBrainDumpError] = useState('');
  const [analysisStartedAt, setAnalysisStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const transcript = projectState?.analysis?.lyrics;
  const transcriptLines = Array.isArray(transcript) ? transcript : [];
  const savedPlan = useMemo(() => {
    if (!projectState?.script) return null;
    const hasPlan = projectState.script?.scenes?.length
      || projectState?.characters?.length
      || projectState?.locations?.length;
    if (!hasPlan) return null;
    return {
      script: projectState.script,
      characters: projectState.characters || [],
      locations: projectState.locations || [],
      shot_list: projectState.shot_list || [],
    };
  }, [projectState]);
  const reviewPlan = generatedPlan || savedPlan;

  useEffect(() => {
    if (!isAnalyzing) return undefined;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - (analysisStartedAt || Date.now())) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [analysisStartedAt, isAnalyzing]);

  const uploadFile = async ({ file, folder, ownerName }) => {
    const path = buildUploadPath(projectId, folder, ownerName, file.name);
    const { error } = await supabase.storage.from('assets').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
    return { publicUrl, path };
  };

  const extractScriptFile = async (file) => {
    const fileName = String(file?.name || '').toLowerCase();
    const fileType = String(file?.type || '').toLowerCase();
    const canExtract = fileType === 'application/pdf'
      || fileType.startsWith('text/')
      || /\.(pdf|txt|md)$/i.test(fileName);
    if (!canExtract) return null;

    const body = new FormData();
    body.append('file', file);
    body.append('storyPrompt', form.storyPrompt || '');
    body.append('moodWords', JSON.stringify(form.moodWords || []));

    const response = await fetch('/api/extract-script-file', {
      method: 'POST',
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error || 'The script file could not be read.');
    }
    return data;
  };

  const buildScriptPatch = async (fileOverride = null) => {
    const script = projectState?.script || {};
    const analysis = projectState?.analysis || {};
    const styleBible = projectState?.style_bible || {};
    let moodWords = uniqueList([...(form.moodWords || []), form.moodDraft]).slice(0, 8);
    let filePatch = {};
    let rawText = form.scriptText;
    let extractedScript = null;
    let extractionError = '';

    const scriptFile = fileOverride || form.scriptFile;
    if (scriptFile) {
      const uploaded = await uploadFile({
        file: scriptFile,
        folder: 'scripts',
        ownerName: safeFileName(scriptFile.name),
      });
      filePatch = {
        file_url: uploaded.publicUrl,
        file_path: uploaded.path,
        file_name: scriptFile.name,
        file_type: scriptFile.type || '',
        file_uploaded_at: new Date().toISOString(),
      };

      const scriptFileType = String(scriptFile.type || '').toLowerCase();
      if (!cleanText(rawText) && (scriptFileType.startsWith('text/') || /\.(txt|md)$/i.test(scriptFile.name))) {
        rawText = await scriptFile.text();
      }

      if (scriptFileType === 'application/pdf' || /\.pdf$/i.test(scriptFile.name)) {
        try {
          extractedScript = await extractScriptFile(scriptFile);
          rawText = cleanText(rawText) || extractedScript.raw_text || extractedScript.summary || '';
          moodWords = uniqueList([...moodWords, ...(extractedScript.mood_keywords || [])]).slice(0, 8);
        } catch (error) {
          extractionError = error.message || 'The PDF uploaded, but its contents could not be read.';
        }
      }

      filePatch = {
        ...filePatch,
        file_extraction_status: extractedScript ? 'ready' : (extractionError ? 'failed' : 'stored'),
        file_extraction_error: extractionError,
        file_extracted_at: extractedScript ? new Date().toISOString() : script.file_extracted_at,
        file_summary: extractedScript?.summary || script.file_summary || '',
        file_visual_notes: extractedScript?.visual_notes || script.file_visual_notes || '',
        file_detected_entities: extractedScript?.detected_entities || script.file_detected_entities || null,
      };
    }

    const summary = form.storyPrompt || extractedScript?.summary || script.summary || script.storyline || analysis.summary || '';
    const moodText = moodWords.join(', ');

    return {
      script: {
        ...script,
        ...filePatch,
        raw_text: rawText,
        summary,
        mood: moodText || script.mood || analysis.mood || '',
        mood_keywords: moodWords,
      },
      analysis: {
        ...analysis,
        summary,
        mood: moodText || analysis.mood || script.mood || '',
      },
      style_bible: {
        ...styleBible,
        global_notes: form.globalStyleNotes || extractedScript?.visual_notes || styleBible.global_notes || '',
      },
    };
  };

  const mergeGeneratedScript = (planScript = {}, existingScript = {}, existingAnalysis = {}) => {
    const moodWords = uniqueList([
      ...splitList(existingScript.mood_keywords),
      ...splitList(existingScript.mood),
      ...splitList(existingAnalysis.mood),
      ...splitList(planScript.mood),
    ]).slice(0, 8);

    const moodText = moodWords.join(', ');
    const summary = cleanText(
      planScript.summary
      || planScript.storyline
      || existingScript.summary
      || existingScript.storyline
      || existingAnalysis.summary
      || form.storyPrompt
    );

    return {
      ...existingScript,
      ...planScript,
      summary,
      mood: moodText || cleanText(planScript.mood || existingScript.mood || existingAnalysis.mood),
      mood_keywords: moodWords.length ? moodWords : deriveMoodWords(planScript, existingAnalysis),
      raw_text: cleanText(existingScript.raw_text || existingScript.text || form.scriptText),
    };
  };

  const buildEntityPatch = async (kind) => {
    const rows = kind === 'characters' ? form.characters : form.locations;
    const folder = kind === 'characters' ? 'characters' : 'locations';
    const imageKind = kind === 'characters' ? 'wardrobe_brain_dump' : 'location_brain_dump';
    const nextRows = [];

    for (const row of rows) {
      const uploads = [];
      for (const [fileIndex, file] of (row.pendingFiles || []).entries()) {
        const uploaded = await uploadFile({ file, folder, ownerName: row.name || folder });
        uploads.push({
          url: uploaded.publicUrl,
          path: uploaded.path,
          label: `BRAIN DUMP REF ${(row.images || []).length + fileIndex + 1}`,
          kind: imageKind,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
        });
      }
      nextRows.push({ ...row, images: [...(row.images || []), ...uploads], pendingFiles: [] });
    }

    setForm(prev => ({ ...prev, [kind]: nextRows }));
    return kind === 'characters'
      ? { characters: serializeCharacters(nextRows) }
      : { locations: serializeLocations(nextRows) };
  };

  const saveBuiltPatch = async (buildPatch, tabName) => {
    setSavingTab(tabName);
    setBrainDumpError('');
    try {
      const patch = await buildPatch();
      await onDataUpdate(patch);
      if (tabName === 'script') {
        setForm(prev => ({ ...prev, scriptFile: null, moodDraft: '' }));
      }
      return patch;
    } catch (error) {
      setBrainDumpError(error.message || 'Save failed. Please try again.');
      return null;
    } finally {
      setSavingTab('');
    }
  };

  const saveScriptData = async () => saveBuiltPatch(buildScriptPatch, 'script');
  const saveCharacterData = async () => saveBuiltPatch(() => buildEntityPatch('characters'), 'characters');
  const saveLocationData = async () => saveBuiltPatch(() => buildEntityPatch('locations'), 'locations');

  const handleBrainDump = async (customPrompt = null) => {
    const finalPrompt = cleanText(customPrompt || form.storyPrompt || form.scriptText);
    if (!finalPrompt) {
      setBrainDumpError('Please enter an idea first.');
      return;
    }

    setBrainDumpError('');
    setAnalysisStartedAt(Date.now());
    setElapsedSeconds(0);
    setIsAnalyzing(true);
    setProgressStep(0);
    const lyricCueTimeout = setTimeout(() => setProgressStep(2), 600);
    try {
      setProgressStep(1);
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: finalPrompt, transcript: transcriptLines }),
      });
      const plan = await response.json().catch(() => ({}));
      if (!response.ok || plan.error) throw new Error(plan.error || 'Creative plan generation failed.');

      setProgressStep(3);
      setGeneratedPlan(plan);
      setProgressStep(4);
      const mergedScript = mergeGeneratedScript(
        plan.script,
        projectState?.script || {},
        projectState?.analysis || {}
      );
      const planPatch = {
        script: mergedScript,
        characters: plan.characters,
        locations: plan.locations,
        shot_list: plan.shot_list,
        current_step: 4,
      };
      await onDataUpdate(planPatch);
      setForm(prev => ({
        ...deriveBrainDumpForm({ ...projectState, ...planPatch }),
        storyPrompt: prev.storyPrompt || mergedScript.summary || '',
        scriptText: prev.scriptText || mergedScript.raw_text || '',
        moodDraft: prev.moodDraft || '',
      }));
      setProgressStep(5);
    } catch (error) {
      console.error('Creative plan failed:', error);
      setBrainDumpError(error.message || 'We could not create the plan. Please try again.');
    } finally {
      clearTimeout(lyricCueTimeout);
      setIsAnalyzing(false);
      setProgressStep(-1);
      setAnalysisStartedAt(null);
    }
  };

  const handleScriptFileSelected = async (file) => {
    if (!file) return;
    setSavingTab('script');
    setBrainDumpError('');
    setForm(prev => ({
      ...prev,
      scriptFile: file,
      scriptFileMeta: {
        file_name: file.name,
        file_type: file.type || '',
        pending: true,
      },
    }));

    try {
      const patch = await buildScriptPatch(file);
      await onDataUpdate(patch);
      setForm(prev => ({
        ...prev,
        scriptFile: null,
        scriptFileMeta: {
          file_url: patch.script.file_url,
          file_name: patch.script.file_name,
          file_uploaded_at: patch.script.file_uploaded_at,
          file_type: patch.script.file_type,
          file_extraction_status: patch.script.file_extraction_status,
          file_extraction_error: patch.script.file_extraction_error,
        },
        scriptText: patch.script.raw_text || prev.scriptText,
        storyPrompt: prev.storyPrompt || patch.script.summary || '',
        moodWords: patch.script.mood_keywords || prev.moodWords,
        globalStyleNotes: prev.globalStyleNotes || patch.style_bible.global_notes || '',
      }));
      if (patch.script.file_extraction_error) {
        setBrainDumpError(`Uploaded ${file.name}, but could not read the PDF contents: ${patch.script.file_extraction_error}`);
      }
    } catch (error) {
      console.error('Script file upload failed:', error);
      setBrainDumpError(error.message || 'Script upload failed. Please try again.');
      setForm(prev => ({ ...prev, scriptFile: null }));
    } finally {
      setSavingTab('');
    }
  };

  const handleUseTranscript = () => {
    if (!transcriptLines.length) {
      if (confirm('No lyrics found yet. Analyze the song first?')) onNavigate(2);
      return;
    }
    const lyricText = transcriptLines
      .map(line => cleanText(line?.text || line?.lyrics || line?.line))
      .filter(Boolean)
      .join(' ');
    handleBrainDump(`Based on these lyrics: "${lyricText}". ${form.storyPrompt || form.scriptText}`);
  };

  const handleRefineBrain = async () => {
    setIsRefining(true);
    setBrainDumpError('');
    try {
      const scriptPatch = await buildScriptPatch();
      const characterPatch = await buildEntityPatch('characters');
      const locationPatch = await buildEntityPatch('locations');
      const mergedPatch = { ...scriptPatch, ...characterPatch, ...locationPatch };
      await onDataUpdate(mergedPatch);

      const response = await fetch('/api/process-wardrobe-brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectState: { ...projectState, ...mergedPatch },
          targets: ['characters', 'locations', 'style'],
          rebuildKnowledgeBase: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Brain refinement failed.');

      const nextState = data.project_state || {};
      setForm(deriveBrainDumpForm(nextState));
      await onDataUpdate({
        characters: nextState.characters || characterPatch.characters,
        locations: nextState.locations || locationPatch.locations,
        style_bible: nextState.style_bible || scriptPatch.style_bible,
        ...(nextState.knowledge_base ? { knowledge_base: nextState.knowledge_base } : {}),
      });
      if (data.knowledge_base_error) {
        setBrainDumpError(data.knowledge_base_error);
      }
    } catch (error) {
      console.error('Brain refinement failed:', error);
      setBrainDumpError(error.message || 'Brain refinement failed.');
    } finally {
      setIsRefining(false);
    }
  };

  const setCharacters = (updater) => {
    setForm(prev => ({ ...prev, characters: typeof updater === 'function' ? updater(prev.characters) : updater }));
  };

  const setLocations = (updater) => {
    setForm(prev => ({ ...prev, locations: typeof updater === 'function' ? updater(prev.locations) : updater }));
  };

  return (
    <div className="screen active screen-fill" id="s3">
      <WorkflowThreePaneShell
        showLeftPanel={false}
        sidebarTitle="Brain"
        rightTitle="Brain Status"
        storageKey="workflow-three-pane:s3:brain-dump"
        sidebar={null}
        main={(
          <div className="brain-dump-workspace">
            <div className="brain-tabs" role="tablist" aria-label="Brain dump sections">
              {BRAIN_TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`brain-tab${activeTab === tab.id ? ' is-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
              {transcriptLines.length > 0 && (
                <div className="brain-tabs__meta">
                  <Mic2 size={12} />
                  {transcriptLines.length} lyric lines
                </div>
              )}
            </div>

            {activeTab === 'script' && (
              <ScriptThemeTab
                form={form}
                setForm={setForm}
                isSaving={savingTab === 'script'}
                isAnalyzing={isAnalyzing}
                progressStep={progressStep}
                elapsedSeconds={elapsedSeconds}
                error={brainDumpError}
                reviewPlan={reviewPlan}
                transcript={transcriptLines}
                onSave={saveScriptData}
                onScriptFileSelected={handleScriptFileSelected}
                onGeneratePlan={() => handleBrainDump()}
                onUseTranscript={handleUseTranscript}
                onEditIdea={() => setGeneratedPlan(null)}
              />
            )}

            {activeTab === 'characters' && (
              <EntityVibesTab
                kind="character"
                rows={form.characters}
                setRows={setCharacters}
                isSaving={savingTab === 'characters'}
                onSave={saveCharacterData}
              />
            )}

            {activeTab === 'locations' && (
              <EntityVibesTab
                kind="location"
                rows={form.locations}
                setRows={setLocations}
                isSaving={savingTab === 'locations'}
                onSave={saveLocationData}
              />
            )}
          </div>
        )}
        right={(
          <BrainStatusPanel
            projectId={projectId}
            projectState={projectState}
            onDataUpdate={onDataUpdate}
            onRefineBrain={handleRefineBrain}
            isRefining={isRefining}
          />
        )}
      />
    </div>
  );
}

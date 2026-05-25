import { FileText, Loader2, Mic2, Save, Sparkles, UploadCloud, X } from 'lucide-react';
import ProgressBar from '@/components/ProgressBar';
import CreativePlanReview from './CreativePlanReview';
import { MOOD_SUGGESTIONS } from './brainDumpConstants';
import { cleanText } from './brainDumpUtils';

export default function ScriptThemeTab({
  form,
  setForm,
  isSaving,
  isAnalyzing,
  progressStep,
  elapsedSeconds,
  error,
  reviewPlan,
  transcript,
  onSave,
  onScriptFileSelected,
  onGeneratePlan,
  onUseTranscript,
  onEditIdea,
}) {
  const addMood = (word) => {
    const next = cleanText(word).toLowerCase();
    if (!next) return;
    setForm(prev => ({
      ...prev,
      moodWords: [...new Set([...(prev.moodWords || []), next])].slice(0, 8),
      moodDraft: '',
    }));
  };

  const removeMood = (word) => {
    setForm(prev => ({
      ...prev,
      moodWords: prev.moodWords.filter(item => item !== word),
    }));
  };

  const handleMoodKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    addMood(form.moodDraft);
  };

  const handleScriptFile = (file) => {
    if (!file) return;
    onScriptFileSelected(file);
  };

  const fileStatus = form.scriptFileMeta?.file_extraction_status;
  const fileLabel = isSaving && form.scriptFile
    ? 'Uploading and reading...'
    : (form.scriptFile?.name || form.scriptFileMeta?.file_name || 'Script file');
  const fileHint = isSaving && form.scriptFile
    ? 'PDFs may take a moment'
    : fileStatus === 'ready'
      ? 'PDF read into Script source'
      : fileStatus === 'failed'
        ? 'Saved, reading failed'
        : form.scriptFileMeta?.file_name
          ? 'Saved to project brain'
          : 'PDF, TXT, or Markdown';

  return (
    <div className="brain-tab-panel">
      <div className="brain-tab-panel__intro brain-tab-panel__intro--split">
        <div>
          <div className="screen-kicker">Story Brain</div>
          <h1 className="screen-title">Shape the film.</h1>
          <p className="screen-subtitle">A clean brief is enough. The rest can stay rough.</p>
        </div>
        <div className="brain-tab-actions">
          <button type="button" className="btn-action-generate" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {isSaving ? 'Saving...' : 'Save Story'}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={onGeneratePlan}
            disabled={isSaving || isAnalyzing || !cleanText(form.storyPrompt || form.scriptText)}
          >
            {isAnalyzing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {isAnalyzing ? 'Generating...' : 'Generate Plan'}
          </button>
        </div>
      </div>

      <div className="brain-focus-scroll">
        <section className="brain-brief-sheet">
          <div className="brain-source-bar">
            <label
              className="brain-dropzone brain-dropzone--compact"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleScriptFile(event.dataTransfer?.files?.[0] || null);
              }}
            >
              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  event.target.value = '';
                  handleScriptFile(file);
                }}
              />
              <UploadCloud size={17} />
              <span>{fileLabel}</span>
              <small className={fileStatus === 'failed' ? 'is-error' : ''}>{fileHint}</small>
            </label>

            <div className="brain-mood-panel">
              <div className="brain-mood-panel__top">
                <span>Mood</span>
                <button type="button" className="btn-outline-small" onClick={onUseTranscript} disabled={isAnalyzing}>
                  <Mic2 size={12} />
                  {transcript ? 'Lyrics' : 'Audio'}
                </button>
              </div>
              <div className="brain-chip-row brain-chip-row--compact">
                {(form.moodWords || []).map(word => (
                  <button key={word} type="button" className="brain-chip brain-chip--selected" onClick={() => removeMood(word)}>
                    {word}
                    <X size={10} />
                  </button>
                ))}
                {MOOD_SUGGESTIONS
                  .filter(word => !(form.moodWords || []).includes(word))
                  .slice(0, Math.max(0, 5 - (form.moodWords || []).length))
                  .map(word => (
                    <button key={word} type="button" className="brain-chip" onClick={() => addMood(word)}>
                      {word}
                    </button>
                  ))}
              </div>
              <input
                className="input-inset brain-mood-input"
                placeholder="Add mood"
                value={form.moodDraft}
                onChange={(event) => setForm(prev => ({ ...prev, moodDraft: event.target.value }))}
                onKeyDown={handleMoodKeyDown}
                onBlur={() => addMood(form.moodDraft)}
              />
            </div>
          </div>

          <div className="brain-primary-field">
            <label className="form-label" htmlFor="brain-story-prompt">Story prompt</label>
            <textarea
              id="brain-story-prompt"
              className="textarea-inset brain-story-editor"
              placeholder="In two or three sentences, what is this film or video about?"
              value={form.storyPrompt}
              onChange={(event) => setForm(prev => ({ ...prev, storyPrompt: event.target.value }))}
            />
          </div>

          <details className="brain-disclosure" open={Boolean(form.scriptText || form.scriptFileMeta?.file_name)}>
            <summary>
              <FileText size={13} />
              Script source
            </summary>
            <textarea
              id="brain-script-text"
              className="textarea-inset brain-textarea-tall"
              placeholder="Paste the script, treatment, scene outline, or lyric-driven story notes here."
              value={form.scriptText}
              onChange={(event) => setForm(prev => ({ ...prev, scriptText: event.target.value }))}
            />
          </details>

          <details className="brain-disclosure" open={Boolean(form.globalStyleNotes)}>
            <summary>
              <Sparkles size={13} />
              Visual tone
            </summary>
            <textarea
              id="brain-style-notes"
              className="textarea-inset"
              rows={3}
              placeholder="Optional cinematography, reference films, lighting, grain, pacing, or colour notes."
              value={form.globalStyleNotes}
              onChange={(event) => setForm(prev => ({ ...prev, globalStyleNotes: event.target.value }))}
            />
          </details>

          {isAnalyzing && (
            <div className="brain-progress">
              <ProgressBar
                steps={[
                  'Reading your idea',
                  'Finding lyric and mood cues',
                  'Writing scenes',
                  'Drafting cast and locations',
                  'Building the shot plan',
                  'Saving creative plan',
                ]}
                currentStep={progressStep}
              />
              <div className="field-note">
                Generating {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
              </div>
            </div>
          )}

          {error && !isAnalyzing && (
            <div className="queue-msg queue-msg--error brain-error">
              <span>Alert:</span>
              {error}
            </div>
          )}
        </section>

        {reviewPlan && (
          <CreativePlanReview plan={reviewPlan} onEditIdea={onEditIdea} />
        )}
      </div>
    </div>
  );
}

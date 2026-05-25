import { Loader2, Plus, Save } from 'lucide-react';
import BrainEntityCard from './BrainEntityCard';
import { CHARACTER_STYLE_TAGS, LOCATION_STYLE_TAGS } from './brainDumpConstants';

export default function EntityVibesTab({
  kind,
  rows,
  setRows,
  isSaving,
  onSave,
}) {
  const isCharacter = kind === 'character';
  const title = isCharacter ? 'Characters' : 'Locations';
  const subtitle = isCharacter
    ? 'Minimum: one image and one sentence for each main character.'
    : 'Optional: add visually important places before shot planning.';
  const tagOptions = isCharacter ? CHARACTER_STYLE_TAGS : LOCATION_STYLE_TAGS;

  const updateRow = (index, patch) => {
    setRows(prev => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )));
  };

  const addFiles = (index, files) => {
    setRows(prev => prev.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, pendingFiles: [...(row.pendingFiles || []), ...files].slice(0, 5) }
        : row
    )));
  };

  const removeRow = (index) => {
    setRows(prev => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [{ id: `${kind}-draft-${Date.now()}`, name: '', role: '', notes: '', tags: [], images: [], pendingFiles: [], detailsOpen: false }];
    });
  };

  const addRow = () => {
    setRows(prev => ([
      ...prev,
      { id: `${kind}-draft-${Date.now()}`, name: '', role: '', notes: '', tags: [], images: [], pendingFiles: [], detailsOpen: false },
    ]));
  };

  return (
    <div className="brain-tab-panel">
      <div className="brain-tab-panel__intro brain-tab-panel__intro--split">
        <div>
          <div className="screen-kicker">{isCharacter ? 'Cast Brain' : 'World Brain'}</div>
          <h1 className="screen-title">{title}</h1>
          <p className="screen-subtitle">{subtitle}</p>
        </div>
        <div className="brain-tab-actions">
          <button type="button" className="btn-outline" onClick={addRow}>
            <Plus size={14} />
            Add
          </button>
          <button type="button" className="btn-action-generate" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {isSaving ? 'Saving...' : `Save ${isCharacter ? 'Cast' : 'Places'}`}
          </button>
        </div>
      </div>

      <div className="brain-focus-scroll brain-focus-scroll--entity">
        <div className="brain-entity-list">
          {rows.map((row, index) => (
            <BrainEntityCard
              key={row.id || index}
              kind={kind}
              item={row}
              index={index}
              tagOptions={tagOptions}
              onChange={(patch) => updateRow(index, patch)}
              onFiles={(files) => addFiles(index, files)}
              onRemove={() => removeRow(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

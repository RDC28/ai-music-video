import { ChevronDown, ChevronUp, ImagePlus, Trash2, X } from 'lucide-react';
import { cleanText } from './brainDumpUtils';

export default function BrainEntityCard({
  kind,
  item,
  index,
  tagOptions,
  onChange,
  onFiles,
  onRemove,
}) {
  const isCharacter = kind === 'character';
  const title = isCharacter ? 'Character' : 'Location';
  const noteLabel = isCharacter ? 'Vibe and dress notes' : 'Screen feeling notes';
  const notePlaceholder = isCharacter
    ? 'How do they move, dress, carry themselves, and change emotionally?'
    : 'How should this place feel on screen? Include geography, mood, weather, and lighting.';

  const toggleTag = (tag) => {
    const current = Array.isArray(item.tags) ? item.tags : [];
    const exists = current.includes(tag);
    onChange({ tags: exists ? current.filter(value => value !== tag) : [...current, tag] });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };

  return (
    <article className="brain-entity-card">
      <div className="brain-entity-card__top">
        <label
          className="brain-ref-dropzone brain-ref-dropzone--avatar"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length) onFiles(files);
            }}
          />
          {item.images?.[0]?.url ? (
            <img src={item.images[0].url} alt={item.images[0].label || `${title} reference`} />
          ) : (
            <>
              <ImagePlus size={16} />
              <span>Refs</span>
            </>
          )}
        </label>

        <div className="brain-entity-card__title">
          <div className="brain-entity-card__number">
            {String(index + 1).padStart(2, '0')} {title}
          </div>
          <input
            className="input-inset"
            placeholder={`${title} name`}
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          {isCharacter && (
            <input
              className="input-inset"
              placeholder="Role preview"
              value={item.role}
              onChange={(event) => onChange({ role: event.target.value })}
            />
          )}
        </div>
        <button type="button" className="brain-icon-button" onClick={onRemove} aria-label={`Remove ${title.toLowerCase()}`}>
          <Trash2 size={14} />
        </button>
      </div>

      {((item.images?.length || 0) > 1 || item.pendingFiles?.length) && (
        <div className="brain-ref-strip">
          {(item.images || []).slice(1, 5).map((image, imageIndex) => (
            <div className="brain-ref-thumb" key={`${image.url}-${imageIndex}`}>
              <img src={image.url} alt={image.label || `${title} reference`} />
              <span>{image.label || `REF ${imageIndex + 2}`}</span>
            </div>
          ))}
          {(item.pendingFiles || []).map((file, fileIndex) => (
            <div className="brain-ref-thumb brain-ref-thumb--pending" key={`${file.name}-${fileIndex}`}>
              <ImagePlus size={14} />
              <span>{file.name}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="form-label">{noteLabel}</label>
        <textarea
          className="textarea-inset"
          rows={3}
          placeholder={notePlaceholder}
          value={item.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>

      <button
        type="button"
        className="brain-refine-toggle"
        onClick={() => onChange({ detailsOpen: !item.detailsOpen })}
      >
        {item.detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Refine
      </button>

      {item.detailsOpen && (
        <div className="brain-refine-panel">
          <div className="brain-chip-row">
            {tagOptions.map(tag => (
              <button
                key={tag}
                type="button"
                className={`brain-chip${item.tags?.includes(tag) ? ' brain-chip--selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
                {item.tags?.includes(tag) && <X size={10} />}
              </button>
            ))}
          </div>

          {isCharacter ? (
            <>
              <input
                className="input-inset"
                placeholder="Canonical default outfit"
                value={item.default_outfit}
                onChange={(event) => onChange({ default_outfit: event.target.value })}
              />
              <input
                className="input-inset"
                placeholder="Signature accessories, hair, tattoos"
                value={item.signature_elements}
                onChange={(event) => onChange({ signature_elements: event.target.value })}
              />
            </>
          ) : (
            <>
              <input
                className="input-inset"
                placeholder="Colour palette"
                value={item.color_notes}
                onChange={(event) => onChange({ color_notes: event.target.value })}
              />
              <input
                className="input-inset"
                placeholder="Time of day, weather, lighting"
                value={item.time_and_light}
                onChange={(event) => onChange({ time_and_light: event.target.value })}
              />
              <input
                className="input-inset"
                placeholder="Materials and textures"
                value={item.materials}
                onChange={(event) => onChange({ materials: event.target.value })}
              />
            </>
          )}
        </div>
      )}

      {!cleanText(item.name) && (
        <p className="field-note">Name this {title.toLowerCase()} before saving it into the project brain.</p>
      )}
    </article>
  );
}

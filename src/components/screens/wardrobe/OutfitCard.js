'use client';

import { ImagePlus, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { hasOutfitLock } from './wardrobeConstants';

export default function OutfitCard({
  outfit,
  charIndex,
  activeLocationIndex,
  isUploading,
  uploadTarget,
  draggingTarget,
  setDraggingTarget,
  suggestingKey,
  generatingAllKey,
  generatingImageKey,
  onUploadClick,
  onDrop,
  onUpdateOutfit,
  onPersistWardrobe,
  onSuggestOutfit,
  onGenerateOutfitImage,
  wardrobeRef,
}) {
  const isDragTarget = draggingTarget?.locIndex === activeLocationIndex && draggingTarget?.charIndex === charIndex;
  const isThisUploading = isUploading && uploadTarget?.locIndex === activeLocationIndex && uploadTarget?.charIndex === charIndex;
  const cardKey = `${activeLocationIndex}-${charIndex}`;
  const isSuggesting = suggestingKey === cardKey;
  const isGenImg = generatingImageKey === cardKey;
  const busyElsewhere = !!(suggestingKey || generatingAllKey) && !isSuggesting;
  const imgBusyElsewhere = !!generatingImageKey && !isGenImg;
  const hasDescription = Boolean(outfit.description?.trim());

  const dragHandlers = {
    onDragOver: (e) => { e.preventDefault(); if (!isUploading) setDraggingTarget({ locIndex: activeLocationIndex, charIndex }); },
    onDragEnter: (e) => { e.preventDefault(); if (!isUploading) setDraggingTarget({ locIndex: activeLocationIndex, charIndex }); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDraggingTarget(null); },
    onDrop: (e) => onDrop(e, activeLocationIndex, charIndex),
  };

  return (
    <article key={outfit.character_id || charIndex} className="outfit-grid-card">
      <div className="flex-between" style={{ gap: '0.75rem' }}>
        <div style={{ minWidth: 0 }}>
          <div className="outfit-char-name">{outfit.character_name}</div>
          <div className="outfit-char-status">
            {hasOutfitLock(outfit) ? 'Outfit override locked' : 'Uses base character outfit'}
          </div>
        </div>
        <span className={`tag-badge ${hasOutfitLock(outfit) ? 'tag-teal' : 'tag-outline'}`} style={{ flexShrink: 0 }}>
          {hasOutfitLock(outfit) ? 'Locked' : 'Default'}
        </span>
      </div>

      {outfit.image_url ? (
        <div {...dragHandlers} style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => onUploadClick(activeLocationIndex, charIndex)}
            style={{
              padding: 0,
              border: isDragTarget ? '0.125rem dashed var(--cyan-border)' : '0.0625rem solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              cursor: 'pointer',
              background: 'var(--bg-deep)',
              width: '100%',
              maxHeight: '21.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 160ms ease-out',
            }}
            title="Click or drop to replace outfit image"
          >
            <img
              src={outfit.image_url}
              alt={`${outfit.character_name} outfit`}
              style={{ width: '100%', height: '100%', maxHeight: '21.25rem', objectFit: 'contain', display: 'block', opacity: isDragTarget ? 0.4 : 1, transition: 'opacity 160ms ease-out' }}
            />
            {isDragTarget && (
              <div className="flex-col flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.06)', pointerEvents: 'none' }}>
                <ImagePlus size={24} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to replace</span>
              </div>
            )}
            {isThisUploading && (
              <div className="flex-center" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.5)' }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--cyan)' }} />
              </div>
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onUploadClick(activeLocationIndex, charIndex)}
          {...dragHandlers}
          disabled={isUploading}
          style={{
            background: isDragTarget ? 'rgba(var(--cyan-rgb), 0.04)' : 'var(--bg-deep)',
            boxShadow: 'var(--neo-inset)',
            border: isDragTarget ? '0.0938rem dashed var(--cyan-border)' : '0.0938rem dashed var(--border-mid)',
            borderRadius: 'var(--radius)',
            minHeight: '7.5rem',
            cursor: isUploading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '0.5rem',
            color: 'var(--text-muted)',
            transition: 'border-color 160ms ease-out, background 160ms ease-out',
          }}
          onMouseEnter={e => { if (!draggingTarget) e.currentTarget.style.borderColor = 'var(--cyan-border)'; }}
          onMouseLeave={e => { if (!draggingTarget) e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
        >
          {isThisUploading
            ? <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)' }} />
            : <ImagePlus size={20} style={{ color: 'var(--cyan)' }} />
          }
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            {isDragTarget ? 'Drop to upload' : 'Click or drop image'}
          </span>
        </button>
      )}

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <input
          className="input-inset"
          value={outfit.outfit_name || ''}
          onChange={event => onUpdateOutfit(activeLocationIndex, charIndex, { outfit_name: event.target.value })}
          onBlur={() => onPersistWardrobe(wardrobeRef.current)}
          placeholder="Optional outfit name"
        />
        <textarea
          className="textarea-inset"
          value={outfit.description || ''}
          onChange={event => onUpdateOutfit(activeLocationIndex, charIndex, { description: event.target.value })}
          onBlur={() => onPersistWardrobe(wardrobeRef.current)}
          placeholder="Optional override. Leave blank to use the base outfit from the character reference sheet."
          style={{ minHeight: '5.5rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onSuggestOutfit(activeLocationIndex, charIndex)}
          disabled={isSuggesting || busyElsewhere || isUploading}
          title="Ask AI to suggest an outfit for this character at this location"
          style={{ flex: 1, fontSize: '0.6875rem', minWidth: '7rem', justifyContent: 'center' }}
        >
          {isSuggesting
            ? <><Loader2 size={11} className="spin" /> Suggesting…</>
            : <><Sparkles size={11} /> AI Suggest</>}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onGenerateOutfitImage(activeLocationIndex, charIndex)}
          disabled={isGenImg || imgBusyElsewhere || isUploading || !hasDescription}
          title={hasDescription ? 'Generate outfit image from description' : 'Add a description first'}
          style={{ flex: 1, fontSize: '0.6875rem', minWidth: '7rem', justifyContent: 'center' }}
        >
          {isGenImg
            ? <><Loader2 size={11} className="spin" /> Generating…</>
            : <><Wand2 size={11} /> Generate image</>}
        </button>
      </div>
    </article>
  );
}

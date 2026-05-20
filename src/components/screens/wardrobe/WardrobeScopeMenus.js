'use client';

import { useRef } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';

export function SuggestScopeMenu({
  suggestScopeRef,
  showSuggestScope,
  setShowSuggestScope,
  setShowGenerateScope,
  suggestingKey,
  generatingAllKey,
  isSuggestingAllLocs,
  isUploading,
  suggestAllProgress,
  activeLocation,
  wardrobe,
  onSuggestThisLocation,
  onSuggestAllLocations,
}) {
  return (
    <div ref={suggestScopeRef} style={{ position: 'relative' }}>
      <button
        className="btn-secondary"
        onClick={() => { setShowGenerateScope(false); setShowSuggestScope(v => !v); }}
        disabled={!!suggestingKey || !!generatingAllKey || isSuggestingAllLocs || isUploading}
        style={{ fontSize: '0.75rem' }}
      >
        {isSuggestingAllLocs
          ? <><Loader2 size={13} className="spin" /> {suggestAllProgress.done}/{suggestAllProgress.total} locations…</>
          : generatingAllKey
            ? <><Loader2 size={13} className="spin" /> Suggesting…</>
            : <><Sparkles size={13} /> Suggest all ▾</>}
      </button>
      {showSuggestScope && (
        <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', right: 0, zIndex: 200, background: 'var(--surface-raised)', border: '0.0625rem solid var(--border-mid)', borderRadius: 'var(--radius)', boxShadow: 'var(--neo-raised)', minWidth: '13rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', borderBottom: '0.0625rem solid var(--border)' }}>Suggest outfits for</div>
          <button onClick={onSuggestThisLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <Sparkles size={13} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>This location</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{activeLocation?.location_name}</div>
            </div>
          </button>
          <button onClick={onSuggestAllLocations} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left', borderTop: '0.0625rem solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <Sparkles size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>All locations</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{wardrobe.length} locations · runs sequentially</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export function GenerateScopeMenu({
  generateScopeRef,
  showGenerateScope,
  setShowGenerateScope,
  setShowSuggestScope,
  wardrobeQueue,
  pendingAll,
  pendingHere,
  activeLocation,
  wardrobe,
  onGenerateThisLocation,
  onGenerateAllLocations,
}) {
  if (pendingAll === 0 && !wardrobeQueue.isActive) return null;
  return (
    <div ref={generateScopeRef} style={{ position: 'relative' }}>
      <button
        className="btn-action-generate"
        onClick={() => { setShowSuggestScope(false); setShowGenerateScope(v => !v); }}
        disabled={wardrobeQueue.isActive}
        style={{ fontSize: '0.75rem' }}
      >
        {wardrobeQueue.isActive
          ? <><Loader2 size={13} className="spin" /> {wardrobeQueue.stats.done}/{wardrobeQueue.stats.total} images…</>
          : <><Wand2 size={13} /> Generate images ▾</>}
      </button>
      {showGenerateScope && (
        <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', right: 0, zIndex: 200, background: 'var(--surface-raised)', border: '0.0625rem solid var(--border-mid)', borderRadius: 'var(--radius)', boxShadow: 'var(--neo-raised)', minWidth: '14rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', borderBottom: '0.0625rem solid var(--border)' }}>Generate outfit images for</div>
          <button onClick={onGenerateThisLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'} disabled={pendingHere === 0}>
            <Wand2 size={13} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: pendingHere === 0 ? 'var(--text-muted)' : 'var(--text)' }}>This location</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{pendingHere} outfit{pendingHere === 1 ? '' : 's'} pending · {activeLocation?.location_name}</div>
            </div>
          </button>
          <button onClick={onGenerateAllLocations} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left', borderTop: '0.0625rem solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <Wand2 size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>All locations</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{pendingAll} outfit{pendingAll === 1 ? '' : 's'} across {wardrobe.length} locations · runs in parallel</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

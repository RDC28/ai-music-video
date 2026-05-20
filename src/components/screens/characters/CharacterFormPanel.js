'use client';

import { FileText, Loader2, RefreshCw, Upload } from 'lucide-react';
import ProgressBar from '../../ProgressBar';
import { CHARACTER_STEPS } from './characterConstants';

export default function CharacterFormPanel({
  activeChar,
  isGeneratingActive,
  activeCategory,
  setActiveCategory,
  activeAnchorState,
  anyAnchorsGenerating,
  anchorStatus,
  busy,
  isGenerating,
  isProcessingSheet,
  isPanelEditing,
  setIsPanelEditing,
  generatingChar,
  charProgressStep,
  editName,
  setEditName,
  editDesc,
  setEditDesc,
  fileInputRef,
  setShowCreateModal,
  setSheetReplaceTarget,
  setActiveTab,
  activeTab,
  projectCharacters,
  getCharPreviewImage,
  setPreviewTarget,
  forceRefreshAnchor,
  refreshAllAnchors,
  handleGenerateFromScript,
  handleEditSave,
  handleSheetUpload,
  openPanelEdit,
}) {
  return (
    <div className="layout-sidebar scroll-y" style={{ width: '100%', minWidth: 0, padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />

      {isPanelEditing && activeChar ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div className="kicker" style={{ marginBottom: '0.25rem' }}>Edit Character</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '13rem' }}>{activeChar.name}</div>
            </div>
            <button onClick={() => setIsPanelEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.375rem', cursor: 'pointer', padding: '0.125rem 0.375rem', lineHeight: 1, borderRadius: '0.375rem' }}>×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: '1 1 auto' }}>
            <div>
              <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>NAME</label>
              <input className="input-inset" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '0.5625rem 0.75rem', fontSize: '0.8125rem', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>DESCRIPTION</label>
              <textarea className="textarea-inset" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ padding: '0.5625rem 0.75rem', fontSize: '0.8125rem', borderRadius: '0.5rem', height: '6rem', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>

            {activeCategory === 'project' && (
              <div>
                <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>REPLACE SHEET</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4375rem' }}>
                  <button className="btn-outline" style={{ padding: '0.5625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', width: '100%' }}
                    onClick={() => {
                      setSheetReplaceTarget({ index: activeTab, name: (editName || activeChar?.name || '').trim().toUpperCase(), description: editDesc.trim() });
                      setIsPanelEditing(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={13} /> Upload New Sheet
                  </button>
                  <button className="btn-action-generate" style={{ padding: '0.5625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', width: '100%' }}
                    disabled={busy}
                    onClick={() => { setIsPanelEditing(false); handleGenerateFromScript(); }}
                  >
                    <FileText size={13} /> Regenerate from Script
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', marginTop: 'auto' }}>
            <button className="btn-orange" style={{ flex: 1, padding: '0.75rem', fontWeight: 700, fontSize: '0.8125rem' }} onClick={handleEditSave}>
              {activeCategory === 'global' ? 'Rename' : 'Save Changes'}
            </button>
            <button className="btn-outline" style={{ flex: 1, padding: '0.75rem', fontSize: '0.8125rem' }} onClick={() => setIsPanelEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="kicker" style={{ marginBottom: '0.5rem' }}>Character · Studio</div>
            <h2 className="editorial-title editorial-h2" style={{ marginBottom: '0.375rem' }}>
              Build your <span className="text-grad">cast.</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7188rem', lineHeight: 1.5 }}>
              {busy && generatingChar
                ? `Saving ${generatingChar.images.filter(x => x.url).length}/${generatingChar.images.length} sheet…`
                : busy ? 'Processing sheet…' : 'Upload a full sheet or create one.'}
            </p>
          </div>

          {(() => {
            const preview = getCharPreviewImage(activeChar);
            if (!preview) return null;
            return (
              <div style={{ marginBottom: '0.5rem', borderRadius: 'var(--radius)', overflow: 'hidden', border: '0.0625rem solid var(--border-mid)', background: 'var(--bg-deep)', cursor: 'pointer' }}
                onClick={() => setPreviewTarget({ charIdx: activeCategory === 'project' ? activeTab : -1, imgIdx: 0, url: preview.src, label: activeChar.name })}
                title="Click to enlarge"
              >
                <img src={preview.src} alt={activeChar?.name} style={{ width: '100%', display: 'block', aspectRatio: preview.isAnchor ? '16/9' : '21/9', objectFit: 'cover' }} />
                <div style={{ padding: '0.375rem 0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {anchorStatus[activeChar?.name] === 'generating'
                      ? <><Loader2 size={9} className="spin" /> Refreshing anchor…</>
                      : preview.isAnchor ? '✓ Identity anchor' : 'Character sheet'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); forceRefreshAnchor(activeChar); }} disabled={anchorStatus[activeChar?.name] === 'generating'} title="Regenerate identity anchor" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <RefreshCw size={9} />
                    </button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--cyan)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>view ↗</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeChar && !isGeneratingActive && (
            <button onClick={openPanelEdit} className="btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.6875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
              {activeCategory === 'global' ? 'Rename Character' : 'Edit Character'}
            </button>
          )}

          <div className="neo-inset" style={{ display: 'flex', padding: '0.25rem', marginBottom: '1.375rem' }}>
            {['project', 'global'].map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setActiveTab(0); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4375rem', border: activeCategory === cat ? '0.0625rem solid var(--cyan-border)' : '0.0625rem solid transparent', background: activeCategory === cat ? 'var(--surface-2)' : 'transparent', boxShadow: activeCategory === cat ? 'var(--neo-flat)' : 'none', color: activeCategory === cat ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out' }}>
                {cat === 'project' ? 'Project' : 'History'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button onClick={() => setShowCreateModal(true)} disabled={busy} className="btn-orange" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
              Create new
            </button>
            {isGenerating && <ProgressBar steps={CHARACTER_STEPS} currentStep={charProgressStep} />}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeCategory === 'project' && projectCharacters.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Identity Anchors</div>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  {activeChar && !activeChar.isGeneratingReference && (
                    <button className="btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem' }} onClick={() => forceRefreshAnchor(activeChar)} disabled={anchorStatus[activeChar?.name] === 'generating' || anyAnchorsGenerating}>
                      {anchorStatus[activeChar?.name] === 'generating' ? <><Loader2 size={11} className="spin" /> Refreshing…</> : <><RefreshCw size={11} /> Refresh anchor</>}
                    </button>
                  )}
                  <button className="btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem' }} onClick={refreshAllAnchors} disabled={anyAnchorsGenerating}>
                    {anyAnchorsGenerating ? <><Loader2 size={11} className="spin" /> Running…</> : <><RefreshCw size={11} /> Refresh all</>}
                  </button>
                </div>
              </div>
            )}
            {anyAnchorsGenerating && (
              <div style={{ color: 'var(--violet-400)', fontSize: '0.6875rem', lineHeight: 1.5 }}>
                Identity anchors processing — wait before generating shots for best consistency.
              </div>
            )}
            <div className="panel-flat">
              <div className="panel-meta-label">What is an identity anchor?</div>
              <p className="body-sm">An anchor is a single locked portrait generated from the character sheet. Every shot and clip generation uses it to keep the character's face, body, and outfit consistent across the entire video. Refresh it after uploading a new sheet or changing the character description.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

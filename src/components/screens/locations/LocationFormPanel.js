'use client';

import { FileText, Loader2, Upload, Wand2 } from 'lucide-react';
import ProgressBar from '../../ProgressBar';
import { LOCATION_STEPS } from './locationConstants';

export default function LocationFormPanel({
  activeLoc,
  isGeneratingActive,
  activeCategory,
  setActiveCategory,
  setActiveTab,
  busy,
  isGenerating,
  isProcessingSheet,
  isPanelEditing,
  setIsPanelEditing,
  sheetProcessStatus,
  locProgressStep,
  editName,
  setEditName,
  editDesc,
  setEditDesc,
  fileInputRef,
  setShowCreateModal,
  setSheetReplaceTarget,
  setZoomCropTarget,
  activeTab,
  projectLocations,
  locationQueue,
  getLocPreviewImage,
  handleGenerateFromScript,
  handleEditSave,
  handleDelete,
  handleSheetUpload,
  handleGenerateAllLocationSheets,
  openPanelEdit,
}) {
  return (
    <div className="layout-sidebar scroll-y" style={{ width: '100%', minWidth: 0, padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />

      {isPanelEditing && activeLoc ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div className="kicker" style={{ marginBottom: '0.25rem' }}>Edit Location</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '13rem' }}>{activeLoc.name}</div>
            </div>
            <button onClick={() => setIsPanelEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.375rem', cursor: 'pointer', padding: '0.125rem 0.375rem', lineHeight: 1, borderRadius: '0.375rem' }}>×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: '1 1 auto' }}>
            <div>
              <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>LOCATION NAME</label>
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
                      setSheetReplaceTarget({ index: activeTab, name: (editName || activeLoc?.name || '').trim().toUpperCase(), description: editDesc.trim() });
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
              Save Changes
            </button>
            <button className="btn-outline" style={{ flex: 1, padding: '0.75rem', fontSize: '0.8125rem' }} onClick={() => setIsPanelEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="kicker" style={{ marginBottom: '0.5rem' }}>Location · Studio</div>
            <h2 className="editorial-title editorial-h2" style={{ marginBottom: '0.375rem' }}>
              Build your <span className="text-grad">set.</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7188rem', lineHeight: 1.5 }}>
              {busy ? (isProcessingSheet ? 'Processing sheet…' : 'Generating references…') : 'Upload a location sheet or create one.'}
            </p>
          </div>

          {(() => {
            const imgSrc = getLocPreviewImage(activeLoc);
            if (!imgSrc) return null;
            return (
              <div style={{ marginBottom: '0.5rem', borderRadius: 'var(--radius)', overflow: 'hidden', border: '0.0625rem solid var(--border-mid)', background: 'var(--bg-deep)', cursor: 'pointer' }}
                onClick={() => activeLoc?.sheetUrl && setZoomCropTarget({ locIdx: activeCategory === 'project' ? activeTab : -1, imgIdx: null, url: activeLoc.sheetUrl, label: 'LOCATION SHEET', showLabelInput: false })}
                title="Click to view sheet"
              >
                <img src={imgSrc} alt={activeLoc?.name} style={{ width: '100%', display: 'block', aspectRatio: '21/9', objectFit: 'cover' }} />
                <div style={{ padding: '0.375rem 0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Location sheet</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--cyan)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>view ↗</span>
                </div>
              </div>
            );
          })()}

          {activeLoc && !isGeneratingActive && (
            <button
              onClick={openPanelEdit}
              className="btn-outline"
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.6875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
            >
              Edit {activeCategory === 'history' ? 'Details' : 'Location'}
            </button>
          )}

          <div className="neo-inset" style={{ display: 'flex', padding: '0.25rem', marginBottom: '1.375rem' }}>
            {['project', 'history'].map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setActiveTab(0); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4375rem', border: activeCategory === cat ? '0.0625rem solid var(--cyan-border)' : '0.0625rem solid transparent', background: activeCategory === cat ? 'var(--surface-2)' : 'transparent', boxShadow: activeCategory === cat ? 'var(--neo-flat)' : 'none', color: activeCategory === cat ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out' }}>
                {cat === 'project' ? 'Project' : 'History'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button onClick={() => { setShowCreateModal(true); }} disabled={busy} className="btn-orange" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
              Create new
            </button>
            {activeCategory === 'project' && (() => {
              const pending = projectLocations.filter(l => l?.name && !l.sheetUrl && !l.isGeneratingReference).length;
              if (pending === 0 && !locationQueue.isActive) return null;
              return (
                <button
                  className="btn-action-generate"
                  style={{ width: '100%', padding: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 700 }}
                  onClick={handleGenerateAllLocationSheets}
                  disabled={locationQueue.isActive || busy}
                >
                  {locationQueue.isActive
                    ? <><Loader2 size={13} className="spin" /> {locationQueue.stats.done}/{locationQueue.stats.total} sheets…</>
                    : <><Wand2 size={13} /> Generate all sheets ({pending})</>}
                </button>
              );
            })()}
            {isGenerating && <ProgressBar steps={LOCATION_STEPS} currentStep={locProgressStep} />}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
            <div className="panel-flat">
              <div className="panel-meta-label">Hint</div>
              <p className="body-sm">Drag location tabs onto the board to compare sets side by side. Click a card to select it and see controls here.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

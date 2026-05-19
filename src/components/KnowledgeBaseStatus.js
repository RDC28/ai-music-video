'use client';

import { useState, useCallback } from 'react';
import { Brain, RefreshCw, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getKBSummary } from '@/utils/knowledgeBase';

/**
 * KnowledgeBaseStatus
 *
 * Compact panel showing KB build state + rebuild trigger.
 * Embed in any workflow screen where KB context matters.
 *
 * Props:
 *   projectId    — Supabase project ID
 *   projectData  — full project_state object
 *   onDataUpdate — (updates) => Promise<void>  (same pattern as workflow screens)
 *   compact      — if true, render as a single inline row (for embedding in headers)
 */
export default function KnowledgeBaseStatus({ projectId, projectData, onDataUpdate, compact: isCompact = false }) {
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const kb = projectData?.knowledge_base;
  const summary = getKBSummary(kb);

  const handleBuild = useCallback(async () => {
    if (building || !projectId) return;
    setBuilding(true);
    setError('');

    try {
      const res = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectState: projectData }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Build failed. Try again.');
        return;
      }

      await onDataUpdate({ knowledge_base: data.knowledge_base });
    } catch (err) {
      setError('Network error — could not reach the knowledge base builder.');
      console.error('KB build failed:', err);
    } finally {
      setBuilding(false);
    }
  }, [building, projectId, projectData, onDataUpdate]);

  // ── Compact inline row (for header bars) ──────────────────────────────────
  if (isCompact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <KBStatusDot summary={summary} building={building} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {building ? 'Building KB…' : summary.usable ? `KB · ${summary.characters}C ${summary.locations}L` : 'No KB'}
        </span>
        <button
          type="button"
          onClick={handleBuild}
          disabled={building}
          title={summary.usable ? 'Rebuild knowledge base' : 'Build knowledge base'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: building ? 'wait' : 'pointer',
            color: 'var(--text-muted)',
            padding: '0.125rem',
            display: 'flex',
            alignItems: 'center',
            opacity: building ? 0.5 : 1,
          }}
        >
          {building
            ? <Loader2 size={11} className="spin" />
            : <RefreshCw size={11} />}
        </button>
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: `0.0625rem solid ${summary.usable && !summary.stale ? 'var(--border-mid)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.75rem 1rem',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
        aria-expanded={expanded}
      >
        <Brain size={14} color={summary.usable ? 'var(--cyan)' : 'var(--text-muted)'} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          Project Knowledge Base
        </span>
        <KBStatusDot summary={summary} building={building} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {building ? 'Building…' : summary.usable ? (summary.stale ? 'Stale' : 'Ready') : 'Not built'}
        </span>
        {expanded ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '0.0625rem solid var(--border)' }}>
          {summary.usable ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.75rem' }}>
              <KBStatRow label="Characters documented" value={summary.characters} />
              <KBStatRow label="Locations documented" value={summary.locations} />
              <KBStatRow label="Visual style lock" value={summary.has_style ? 'Yes' : 'No'} />
              {summary.mood_keywords.length > 0 && (
                <KBStatRow label="Mood" value={summary.mood_keywords.slice(0, 5).join(' · ')} />
              )}
              <KBStatRow
                label="Last built"
                value={summary.built_at ? new Date(summary.built_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              />
              {summary.stale && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--warning)', fontSize: '0.6875rem', marginTop: '0.125rem' }}>
                  <AlertTriangle size={11} />
                  Knowledge base is over 48 hours old — rebuild recommended.
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.55, marginTop: '0.75rem' }}>
              The knowledge base pre-distills your characters, locations, wardrobe, and visual style
              into precise prompt locks that every generation agent injects automatically.
              Build it once after setting up characters and locations — all shots and clips will benefit.
            </p>
          )}

          {error && (
            <div style={{ marginTop: '0.625rem', color: 'var(--error)', fontSize: '0.6875rem', lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={handleBuild}
            disabled={building || !projectId}
            style={{ marginTop: '0.875rem', width: '100%', justifyContent: 'center', fontSize: '0.75rem' }}
          >
            {building ? (
              <><Loader2 size={13} className="spin" /> Building knowledge base…</>
            ) : summary.usable ? (
              <><RefreshCw size={13} /> Rebuild Knowledge Base</>
            ) : (
              <><Brain size={13} /> Build Knowledge Base</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KBStatusDot({ summary, building }) {
  if (building) return <Loader2 size={11} className="spin" color="var(--cyan)" />;
  if (!summary.usable) return <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: 'var(--border-mid)', flexShrink: 0 }} />;
  if (summary.stale) return <AlertTriangle size={11} color="var(--warning)" />;
  return <CheckCircle2 size={11} color="var(--cyan)" />;
}

function KBStatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-soft)' }}>
        {value}
      </span>
    </div>
  );
}

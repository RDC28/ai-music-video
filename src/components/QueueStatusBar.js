'use client';

import { AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';

/**
 * Floating progress bar for batch generation jobs.
 * Renders nothing when jobs is empty.
 *
 * Props:
 *   jobs       — array from useGenerationQueue
 *   isActive   — bool from useGenerationQueue
 *   stats      — object from useGenerationQueue
 *   onAbort    — abort() from useGenerationQueue
 *   onClear    — clear() from useGenerationQueue
 *   label      — human-readable batch name shown in the header
 */
export default function QueueStatusBar({ jobs, isActive, stats, onAbort, onClear, label = 'Batch generation' }) {
  if (!jobs.length) return null;

  const isDone = !isActive && stats.total > 0 && stats.finished === stats.total;
  const hasFailed = stats.failed > 0;

  const borderColor = hasFailed && isDone
    ? 'rgba(var(--violet-rgb), 0.5)'
    : isDone
      ? 'rgba(var(--cyan-rgb), 0.45)'
      : 'var(--border-mid)';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 10001,
        width: '22rem',
        maxWidth: 'calc(100vw - 3rem)',
        background: 'var(--ink-950)',
        border: `0.0625rem solid ${borderColor}`,
        borderRadius: '0.875rem',
        padding: '0.875rem 1rem',
        boxShadow: '0 0.5rem 2.5rem rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        backdropFilter: 'blur(0.5rem)',
        transition: 'border-color 200ms ease',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isActive ? (
            <Loader2 size={13} className="spin" style={{ color: 'var(--cyan)', flexShrink: 0 }} />
          ) : isDone && !hasFailed ? (
            <CheckCircle size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={13} style={{ color: 'var(--violet-400)', flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '-0.01em',
          }}>
            {label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          {isActive && (
            <button
              onClick={onAbort}
              style={{
                background: 'rgba(var(--violet-rgb), 0.1)',
                border: '0.0625rem solid rgba(var(--violet-rgb), 0.3)',
                color: 'var(--violet-400)',
                borderRadius: '0.375rem',
                padding: '0.1875rem 0.5rem',
                fontSize: '0.5625rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-mono)',
              }}
            >
              STOP
            </button>
          )}
          {!isActive && (
            <button
              onClick={onClear}
              title="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.125rem',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: '0.1875rem', background: 'var(--bg-deep)', borderRadius: '62.5rem', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%`,
            background: hasFailed && isDone ? 'var(--violet-400)' : 'var(--cyan)',
            borderRadius: '62.5rem',
            transition: 'width 350ms ease-out',
          }}
        />
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'done',      label: 'DONE',      color: 'var(--teal)' },
          { key: 'running',   label: 'RUNNING',   color: 'var(--cyan)' },
          { key: 'retrying',  label: 'RETRYING',  color: 'var(--orange)' },
          { key: 'pending',   label: 'QUEUED',    color: 'var(--text-muted)' },
          { key: 'failed',    label: 'FAILED',    color: 'var(--violet-400)' },
          { key: 'cancelled', label: 'CANCELLED', color: 'var(--text-subtle)' },
        ]
          .filter(({ key }) => stats[key] > 0)
          .map(({ key, label: statLabel, color }) => (
            <span
              key={key}
              style={{
                fontSize: '0.5625rem',
                fontWeight: 700,
                color,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em',
              }}
            >
              {stats[key]} {statLabel}
            </span>
          ))}
        <span
          style={{
            fontSize: '0.5625rem',
            color: 'var(--text-subtle)',
            fontFamily: 'var(--font-mono)',
            marginLeft: 'auto',
            letterSpacing: '0.04em',
          }}
        >
          {stats.finished}/{stats.total}
        </span>
      </div>

      {/* ── Failed job list (only when done) ── */}
      {isDone && hasFailed && (
        <div style={{
          borderTop: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)',
          paddingTop: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.1875rem',
        }}>
          {jobs
            .filter(j => j.status === 'failed')
            .slice(0, 5)
            .map(j => (
              <div
                key={j.id}
                style={{ fontSize: '0.5rem', color: 'var(--violet-400)', display: 'flex', gap: '0.375rem', lineHeight: 1.45 }}
              >
                <span style={{ flexShrink: 0 }}>✗</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
                  {j.label}{j.error ? ` — ${j.error.slice(0, 60)}` : ''}
                </span>
              </div>
            ))}
          {stats.failed > 5 && (
            <div style={{ fontSize: '0.5rem', color: 'var(--text-subtle)' }}>
              +{stats.failed - 5} more failed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

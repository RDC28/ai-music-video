'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getStoredLayout(storageKey) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function WorkflowThreePaneShell({
  sidebar,
  main,
  right,
  showLeftPanel = true,
  sidebarTitle = 'Sidebar',
  rightTitle = 'Controls',
  storageKey = 'workflow-three-pane-shell:v1',
  collapsedSidebarWidth = 60,
  defaultSidebarWidth = 252,
  defaultRightWidth = 392,
  minSidebarWidth = 200,
  maxSidebarWidth = 320,
  minRightWidth = 320,
  maxRightWidth = 520,
  minCenterWidth = 640,
  className = '',
  rightPanelClassName = '',
}) {
  const rootRef = useRef(null);
  const dragStateRef = useRef(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const stored = getStoredLayout(storageKey);
    if (typeof stored?.sidebarExpanded === 'boolean') return stored.sidebarExpanded;
    return false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = getStoredLayout(storageKey);
    if (Number.isFinite(stored?.sidebarWidth)) return stored.sidebarWidth;
    return defaultSidebarWidth;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    const stored = getStoredLayout(storageKey);
    if (Number.isFinite(stored?.rightWidth)) return stored.rightWidth;
    return defaultRightWidth;
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = {
      sidebarExpanded,
      sidebarWidth,
      rightWidth,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }, [rightWidth, sidebarExpanded, sidebarWidth, storageKey]);

  const sidebarVisibleWidth = showLeftPanel
    ? (sidebarExpanded ? sidebarWidth : collapsedSidebarWidth)
    : 0;

  const enforceBounds = useCallback((nextSidebarWidth, nextRightWidth) => {
    const containerWidth = rootRef.current?.clientWidth || 0;
    const clampedSidebar = clamp(nextSidebarWidth, minSidebarWidth, maxSidebarWidth);
    const effectiveSidebarWidth = showLeftPanel
      ? (sidebarExpanded ? clampedSidebar : collapsedSidebarWidth)
      : 0;

    const maxRightFromCenter = Math.max(
      minRightWidth,
      containerWidth - effectiveSidebarWidth - minCenterWidth,
    );
    const effectiveMaxRight = Math.min(maxRightWidth, maxRightFromCenter);
    const clampedRight = clamp(nextRightWidth, minRightWidth, effectiveMaxRight);

    return { clampedSidebar, clampedRight };
  }, [collapsedSidebarWidth, maxRightWidth, maxSidebarWidth, minCenterWidth, minRightWidth, minSidebarWidth, showLeftPanel, sidebarExpanded]);

  const onPointerMove = useCallback((event) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;

    if (drag.handle === 'left') {
      const nextSidebarWidth = drag.startSidebarWidth + dx;
      const { clampedSidebar, clampedRight } = enforceBounds(nextSidebarWidth, rightWidth);
      setSidebarWidth(clampedSidebar);
      setRightWidth(clampedRight);
      return;
    }

    if (drag.handle === 'right') {
      const nextRightWidth = drag.startRightWidth - dx;
      const { clampedSidebar, clampedRight } = enforceBounds(sidebarWidth, nextRightWidth);
      setSidebarWidth(clampedSidebar);
      setRightWidth(clampedRight);
    }
  }, [enforceBounds, rightWidth, sidebarWidth]);

  const beginDrag = useCallback((handle, event) => {
    if (!showLeftPanel && handle === 'left') return;
    if (!sidebarExpanded && handle === 'left') return;
    dragStateRef.current = {
      handle,
      startX: event.clientX,
      startSidebarWidth: sidebarWidth,
      startRightWidth: rightWidth,
    };
    setIsDragging(true);
  }, [rightWidth, showLeftPanel, sidebarExpanded, sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const handlePointerMove = (event) => onPointerMove(event);
    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, onPointerMove]);

  const resetWidths = useCallback(() => {
    const bounded = enforceBounds(defaultSidebarWidth, defaultRightWidth);
    setSidebarWidth(bounded.clampedSidebar);
    setRightWidth(bounded.clampedRight);
  }, [defaultRightWidth, defaultSidebarWidth, enforceBounds]);

  const shellClassName = useMemo(() => (
    `three-pane-shell${isDragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`
  ), [className, isDragging]);

  return (
    <div className={shellClassName} ref={rootRef}>
      {showLeftPanel && (
        <aside
          className={`three-pane-panel three-pane-panel--left${sidebarExpanded ? '' : ' is-collapsed'}`}
          style={{ width: `${sidebarVisibleWidth}px` }}
        >
          <div className="three-pane-panel-header">
            <button
              type="button"
              className="three-pane-toggle-btn"
              onClick={() => setSidebarExpanded((prev) => !prev)}
              aria-expanded={sidebarExpanded}
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Menu size={14} />
              {sidebarExpanded ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
            {sidebarExpanded && (
              <div className="three-pane-title">{sidebarTitle}</div>
            )}
          </div>
          <div className="three-pane-panel-body">
            {sidebar}
          </div>
        </aside>
      )}

      {showLeftPanel && (
        <button
          type="button"
          className="three-pane-divider"
          onPointerDown={(event) => beginDrag('left', event)}
          onDoubleClick={resetWidths}
          aria-label="Resize left panel"
          title="Drag to resize. Double-click to reset widths."
        />
      )}

      <section className="three-pane-panel three-pane-panel--main">
        {main}
      </section>

      <button
        type="button"
        className="three-pane-divider"
        onPointerDown={(event) => beginDrag('right', event)}
        onDoubleClick={resetWidths}
        aria-label="Resize right panel"
        title="Drag to resize. Double-click to reset widths."
      />

      <aside
        className={`three-pane-panel three-pane-panel--right ${rightPanelClassName}`.trim()}
        style={{ width: `${rightWidth}px` }}
      >
        <div className="three-pane-panel-header">
          <div className="three-pane-title">{rightTitle}</div>
        </div>
        <div className="three-pane-panel-body">
          {right}
        </div>
      </aside>
    </div>
  );
}

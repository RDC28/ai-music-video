export default function WorkflowBuffer({
  title = 'Preparing your studio',
  message = 'A moment while everything comes into place.',
  variant = 'panel',
}) {
  return (
    <div className={`workflow-buffer workflow-buffer-${variant}`} role="status" aria-live="polite">
      <div className="workflow-buffer-core">
        <div className="workflow-buffer-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <div className="workflow-buffer-title">{title}</div>
          <div className="workflow-buffer-message">{message}</div>
        </div>
      </div>
      <div className="workflow-buffer-track" aria-hidden="true">
        <span />
      </div>
      <div className="workflow-buffer-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

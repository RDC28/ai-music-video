export default function WorkflowBuffer({
  title = 'Preparing your studio',
  message = 'A moment while everything comes into place.',
}) {
  return (
    <div className="workflow-buffer" role="status" aria-live="polite">
      <div className="workflow-buffer-core">
        <div className="workflow-buffer-mark" aria-hidden="true">A</div>
        <div>
          <div className="workflow-buffer-title">{title}</div>
          <div className="workflow-buffer-message">{message}</div>
        </div>
      </div>
      <div className="workflow-buffer-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

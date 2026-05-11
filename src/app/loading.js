import WorkflowBuffer from '@/components/WorkflowBuffer';

export default function Loading() {
  return (
    <div className="workflow-app">
      <main className="workflow-shell">
        <WorkflowBuffer
          title="Opening Aura"
          message="Preparing your creative workspace."
        />
      </main>
    </div>
  );
}

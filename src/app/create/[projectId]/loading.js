import WorkflowBuffer from '@/components/WorkflowBuffer';

export default function Loading() {
  return (
    <div className="workflow-app">
      <main className="workflow-shell">
        <WorkflowBuffer
          title="Opening your project"
          message="Bringing your latest work into view."
        />
      </main>
    </div>
  );
}

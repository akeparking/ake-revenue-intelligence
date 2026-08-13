"use client";

export default function ErrorState({ reset }: { reset: () => void }) {
  return (
    <main className="boot-state">
      <div className="boot-mark error-mark">!</div>
      <h1>Workspace could not be rendered</h1>
      <p>The CRM API may still be starting. No external system was modified.</p>
      <button className="primary-button" onClick={reset}>Retry</button>
    </main>
  );
}

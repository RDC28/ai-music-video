export default function TopBar({ left = 'PRATEEK', right = 'MUSIC VIDEO' }) {
  return (
    <div className="topbar">
      <span className="topbar-name">{left}</span>
      <span className="topbar-right">{right}</span>
    </div>
  );
}

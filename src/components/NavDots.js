const labels = [
  'Landing',
  'Upload Audio',
  'Brain Dump',
  'Characters',
  'Locations',
  'Shotlist',
  'Shots',
  'Images',
  'Videos',
  'Assemble',
];

export default function NavDots({ activeScreen, onNavigate }) {
  return (
    <div className="nav-dots">
      {labels.map((label, i) => (
        <div
          key={i}
          className={`nav-dot${activeScreen === i + 1 ? ' active' : ''}`}
          onClick={() => onNavigate(i + 1)}
          title={label}
        />
      ))}
    </div>
  );
}

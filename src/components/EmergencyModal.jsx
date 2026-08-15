export default function EmergencyModal({ onClose, onChoose }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal emergency-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="eyebrow">PANIC MODE</span>
        <h2>How much time do you have?</h2>
        <p>We’ll protect what matters most — soonest due, highest consequence — and push everything else back. You don’t need to fit it all in.</p>
        <div className="time-options">
          <button onClick={() => onChoose(30)}>30 min</button>
          <button onClick={() => onChoose(60)}>1 hour</button>
          <button onClick={() => onChoose(120)}>2 hours</button>
          <button onClick={() => onChoose(180)}>3+ hours</button>
        </div>
      </div>
    </div>
  );
}

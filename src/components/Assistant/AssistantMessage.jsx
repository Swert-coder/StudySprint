export default function AssistantMessage({ role, text }) {
  return (
    <div className={`assistant-msg assistant-msg-${role}`}>
      <div className="assistant-msg-bubble">{text}</div>
    </div>
  );
}

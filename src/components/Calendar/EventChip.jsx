export default function EventChip({ event, onClick }) {
  const kindClass = `cal-chip-${event.kind}`;
  const doneClass = (event.kind === 'assignment' && event.done) || (event.kind === 'session' && event.complete) ? ' cal-chip-done' : '';
  return (
    <button type="button" className={`cal-chip ${kindClass}${doneClass}`} style={event.color ? { '--chip-color': event.color } : undefined} onClick={() => onClick(event)}>
      {event.kind === 'test' && '📝 '}
      {event.title}
    </button>
  );
}

import { useState } from 'react';
import { startProCheckout } from '../lib/subscription';

const BENEFITS = [
  'AI Organizer — advanced, higher-volume access',
  'Syllabus intelligence — more uploads, deeper extraction',
  'Advanced AI Analyzer feedback',
  'Practice Quiz Maker — more quizzes, more questions',
  'Higher AI usage limits across StudySprint',
  'Automatic academic planning, tuned to your workload',
];

// The card itself — reused both inside the modal (usage-limit paywall) and embedded directly in
// Settings for anyone who wants to upgrade proactively.
function PaywallCard({ reason }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const upgrade = async () => {
    setError(''); setLoading(true);
    try {
      await startProCheckout(); // redirects the browser on success — no further state to set
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="paywall-card">
      {reason && <p className="paywall-reason">{reason}</p>}
      <span className="eyebrow">STUDYSPRINT PRO</span>
      <div className="paywall-price"><span className="paywall-amount">$5.99</span><span className="paywall-period">/month</span></div>
      <p className="paywall-trial">7-day free trial — cancel anytime before it ends and you won't be charged.</p>
      <ul className="paywall-benefits">
        {BENEFITS.map((b) => <li key={b}><span className="paywall-check">✓</span>{b}</li>)}
      </ul>
      {error && <div className="auth-message error">{error}</div>}
      <button className="primary paywall-cta" disabled={loading} onClick={upgrade}>{loading ? 'Starting checkout…' : 'Start 7-Day Free Trial'}</button>
      <p className="paywall-fineprint">After your trial, StudySprint Pro renews at $5.99/month until you cancel. Manage or cancel anytime from Settings.</p>
    </div>
  );
}

// Modal form — used when a free usage limit or Pro-only feature is hit, with `reason` explaining
// specifically why (e.g. "You've reached your free AI Organizer limit...").
export default function Paywall({ reason, onClose }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal paywall-modal" onMouseDown={(e) => e.stopPropagation()}>
        {onClose && <button className="close" onClick={onClose}>×</button>}
        <PaywallCard reason={reason} />
      </div>
    </div>
  );
}

// Non-modal form embedded directly in a page (e.g. the Settings subscription panel).
export function PaywallInline({ reason }) {
  return <div className="panel paywall-inline"><PaywallCard reason={reason} /></div>;
}

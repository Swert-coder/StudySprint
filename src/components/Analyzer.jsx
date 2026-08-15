import { useState } from 'react';
import { supabase } from '../supabase';
import { extractText } from '../extract';
import { isoToday, niceDate } from '../lib/dates';

export default function Analyzer({ data, profile, setTab, notify, addAnalysis, removeAnalysis, addTopicsToWork }) {
  const [inputMode, setInputMode] = useState('file');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const profileReady = profile.gradeLevel && profile.className;

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setReport(null); setError(''); setExtractedText(''); setExtracting(true); setStatus('Reading your file…');
    try {
      const text = await extractText(f, setStatus);
      if (!text.trim()) throw new Error('No readable text was found in that file. Try a clearer photo or a text-based PDF.');
      setExtractedText(text);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    } finally {
      setExtracting(false); setStatus('');
    }
  };

  const usePastedText = () => {
    const t = pastedText.trim();
    if (!t) return;
    setFile(null); setReport(null); setError(''); setExtractedText(t);
  };

  const runAnalysis = async () => {
    if (!extractedText.trim()) return;
    setAnalyzing(true); setError(''); setReport(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('analyze-work', {
        body: { text: extractedText, profile: { gradeLevel: profile.gradeLevel, className: profile.className, typicalGrade: profile.typicalGrade, learningPreferences: profile.learningPreferences, accommodations: profile.accommodations } },
      });
      if (fnError) throw new Error(fnError.message || 'The analyzer could not be reached.');
      if (res?.error) throw new Error(res.error);
      setReport(res.report);
      addAnalysis({ id: Date.now(), date: isoToday(), fileName: file?.name || 'Uploaded work', report: res.report });
      notify('Analysis ready');
    } catch (err) {
      setError(err.message || 'Something went wrong analyzing this file.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="page analyzer">
      <div className="page-heading"><div><h1>Study Analyzer</h1><p>Upload your work and get feedback on strengths, weak spots, and what to study next.</p></div></div>
      <div className="panel privacy-note"><b>🔒 Private by design</b><p>Your file is read right here in your browser and never uploaded anywhere. Only the text you approve below is sent for feedback — review or edit it first, and delete any analysis anytime.</p></div>
      {!profileReady && <div className="panel analyzer-hint"><p>Add your grade level and class in <button onClick={() => setTab('Settings')}>Settings</button> for feedback tailored to you — or analyze without it.</p></div>}
      <div className="panel upload-panel">
        <div className="input-mode-toggle">
          <button type="button" className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}>Upload file</button>
          <button type="button" className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}>Paste text</button>
        </div>
        {inputMode === 'file' ? (
          <>
            <label className="upload-drop">
              <input type="file" accept="application/pdf,image/*" onChange={onFile} hidden />
              <span className="upload-icon">⇪</span>
              <b>{file ? file.name : 'Upload a PDF or photo of your work'}</b>
              <small>PDF, JPG, or PNG</small>
            </label>
            {extracting && <div className="extract-status"><span className="spinner" />{status}</div>}
          </>
        ) : (
          <div className="paste-text-panel">
            <textarea rows="8" placeholder="Paste your essay, homework, or notes here…" value={pastedText} onChange={(e) => setPastedText(e.target.value)} />
            <button type="button" className="primary" disabled={!pastedText.trim()} onClick={usePastedText}>Use this text</button>
          </div>
        )}
        {error && <div className="auth-message error">{error}</div>}
        {extractedText && !extracting && (
          <div className="extract-preview">
            <div className="section-title"><h2>Extracted text</h2><span>{extractedText.length.toLocaleString()} characters</span></div>
            <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} rows="8" />
            <button className="primary" disabled={analyzing} onClick={runAnalysis}>{analyzing ? 'Analyzing…' : '✦ Analyze this work'}</button>
          </div>
        )}
      </div>
      {report && <ReportCard report={report} onAddTopics={() => addTopicsToWork(report.difficultTopics)} />}
      {data.analyses.length > 0 && (
        <div className="panel analysis-history">
          <div className="section-title"><h2>Past analyses</h2></div>
          {data.analyses.map((a) => <AnalysisHistoryItem key={a.id} a={a} onRemove={() => removeAnalysis(a.id)} onAddTopics={() => addTopicsToWork(a.report.difficultTopics)} />)}
        </div>
      )}
    </div>
  );
}

export function ReportCard({ report, onAddTopics }) {
  return (
    <div className="panel report-card">
      <div className="section-title"><h2>Your feedback</h2></div>
      <p className="report-summary">{report.summary}</p>
      <div className="report-grid">
        <div><h3>✓ Strengths</h3><ul>{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        <div><h3>⚠ Areas to work on</h3><ul>{report.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      </div>
      <div className="report-topics">
        <h3>Difficult topics</h3>
        <div className="topic-tags">{report.difficultTopics.map((t, i) => <span className="topic-tag" key={i}>{t}</span>)}</div>
        {report.difficultTopics.length > 0 && <button className="plan-cta" onClick={onAddTopics}>＋ Add these to my study plan</button>}
      </div>
      <div className="report-suggestions"><h3>How to study this</h3><ul>{report.studySuggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
    </div>
  );
}

function AnalysisHistoryItem({ a, onRemove, onAddTopics }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="history-item">
      <button className="history-head" onClick={() => setOpen(!open)}><div><b>{a.fileName}</b><small>{niceDate(a.date)}</small></div><span>{open ? '▲' : '▼'}</span></button>
      {open && <div className="history-body"><ReportCard report={a.report} onAddTopics={onAddTopics} /><button className="remove-analysis" onClick={onRemove}>Delete this analysis</button></div>}
    </div>
  );
}

import { useState } from 'react';
import { extractText } from '../../extract';
import { parseSyllabus } from '../../lib/aiClient';
import { isoToday } from '../../lib/dates';
import SyllabusReview from './SyllabusReview';
import Paywall from '../Paywall';
import UsageBadge from '../UsageBadge';

export default function SyllabusImport({ data, onClose, onImport, userId }) {
  const [inputMode, setInputMode] = useState('file');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [paywall, setPaywall] = useState('');

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setError(''); setExtractedText(''); setExtracting(true); setStatus('Reading your file…');
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
    setFile(null); setError(''); setExtractedText(t);
  };

  const runParse = async () => {
    if (!extractedText.trim()) return;
    setParsing(true); setError('');
    try {
      const res = await parseSyllabus(extractedText, isoToday());
      if (!res.items?.length) {
        setError("Couldn't find any dated items in that syllabus. Try a clearer file or excerpt, or add assignments manually.");
        return;
      }
      setExtraction(res);
    } catch (err) {
      if (err.code === 'limit_reached') { setPaywall(err.message); return; }
      setError(err.message || 'Something went wrong reading this syllabus.');
    } finally {
      setParsing(false);
    }
  };

  if (extraction) {
    return (
      <SyllabusReview
        data={data}
        extraction={extraction}
        onBack={() => setExtraction(null)}
        onClose={onClose}
        onImport={onImport}
      />
    );
  }

  return (
    <div className="page syllabus-import">
      <div className="page-heading">
        <div><h1>Import syllabus</h1><p>Upload a class syllabus and StudySprint will pull out the dates for you.</p></div>
        <button className="edit-btn" onClick={onClose}>← Back to Assignments</button>
      </div>
      <div className="panel privacy-note"><b>🔒 Private by design</b><p>Your file is read right here in your browser and never uploaded anywhere. Only the text you approve below is sent to build the extraction.</p></div>
      <UsageBadge userId={userId} feature="syllabus" />
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
              <b>{file ? file.name : 'Upload a PDF or photo of your syllabus'}</b>
              <small>PDF, JPG, or PNG</small>
            </label>
            {extracting && <div className="extract-status"><span className="spinner" />{status}</div>}
          </>
        ) : (
          <div className="paste-text-panel">
            <textarea rows="8" placeholder="Paste your syllabus text here…" value={pastedText} onChange={(e) => setPastedText(e.target.value)} />
            <button type="button" className="primary" disabled={!pastedText.trim()} onClick={usePastedText}>Use this text</button>
          </div>
        )}
        {error && <div className="auth-message error">{error}</div>}
        {extractedText && !extracting && (
          <div className="extract-preview">
            <div className="section-title"><h2>Extracted text</h2><span>{extractedText.length.toLocaleString()} characters</span></div>
            <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} rows="8" />
            <button className="primary" disabled={parsing} onClick={runParse}>{parsing ? 'Reading your syllabus…' : '✦ Extract dates'}</button>
          </div>
        )}
      </div>
      {paywall && <Paywall reason={paywall} onClose={() => setPaywall('')} />}
    </div>
  );
}

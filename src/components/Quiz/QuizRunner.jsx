import { useState } from 'react';
import { gradeOpenAnswers } from '../../lib/aiClient';
import { isoToday } from '../../lib/dates';

export default function QuizRunner({ quiz, profile, onFinished }) {
  const { questions } = quiz;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => Array(questions.length).fill(''));
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState('');
  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answered = answers[index] !== '' && answers[index] != null;

  const setAnswer = (value) => setAnswers((a) => a.map((x, i) => (i === index ? value : x)));

  const next = async () => {
    if (!isLast) { setIndex((i) => i + 1); return; }
    setGrading(true); setError('');
    try {
      const closedResults = questions.map((qq, i) => {
        if (qq.type === 'short-answer' || qq.type === 'long-answer') return null;
        const correct = qq.type === 'true-false' ? String(answers[i]).toLowerCase() === String(qq.answer).toLowerCase() : answers[i] === qq.answer;
        return { index: i, correct, feedback: correct ? 'Correct.' : `The answer was "${qq.answer}".` };
      });
      const hasOpenQuestions = questions.some((qq) => qq.type === 'short-answer' || qq.type === 'long-answer');
      const openResults = hasOpenQuestions ? await gradeOpenAnswers(questions, answers, profile) : [];
      const results = questions.map((qq, i) => closedResults[i] || openResults.find((r) => r.index === i) || { index: i, correct: false, feedback: '' });
      const correctCount = results.filter((r) => r.correct).length;
      const weakTopics = [...new Set(results.filter((r) => !r.correct).map((r) => questions[r.index]?.topic).filter(Boolean))];
      onFinished({
        id: Date.now(), date: isoToday(), subject: quiz.subject, difficulty: quiz.difficulty,
        questionCount: questions.length, questions, answers, results,
        score: Math.round((correctCount / questions.length) * 100), correctCount, weakTopics, sourceText: quiz.sourceText,
      });
    } catch (err) {
      setError(err.message || 'Could not grade this quiz. Please try again.');
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="quiz-runner">
      <div className="quiz-progress-row">
        <span>Question {index + 1} of {questions.length}</span>
        <div className="bar quiz-progress-bar"><i style={{ width: `${(index / questions.length) * 100}%` }} /></div>
      </div>
      <div className="quiz-question-card">
        <h2>{q.question}</h2>
        {q.type === 'multiple-choice' && (
          <div className="quiz-choices">
            {q.options.map((opt) => <button key={opt} type="button" className={'quiz-choice' + (answers[index] === opt ? ' selected' : '')} onClick={() => setAnswer(opt)}>{opt}</button>)}
          </div>
        )}
        {q.type === 'true-false' && (
          <div className="quiz-choices quiz-choices-tf">
            {['True', 'False'].map((opt) => <button key={opt} type="button" className={'quiz-choice' + (answers[index] === opt ? ' selected' : '')} onClick={() => setAnswer(opt)}>{opt}</button>)}
          </div>
        )}
        {(q.type === 'short-answer' || q.type === 'long-answer') && (
          <textarea className="quiz-answer-input" rows={q.type === 'long-answer' ? 6 : 3} placeholder="Type your answer…" value={answers[index]} onChange={(e) => setAnswer(e.target.value)} />
        )}
      </div>
      {error && <div className="auth-message error">{error}</div>}
      <button className="primary quiz-next-btn" disabled={!answered || grading} onClick={next}>{grading ? 'Grading…' : isLast ? 'Finish quiz' : 'Next question →'}</button>
    </div>
  );
}

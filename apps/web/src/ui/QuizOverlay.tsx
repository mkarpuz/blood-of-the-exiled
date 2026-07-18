import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useGameState } from '../game-store';
import { gameNetwork } from '../network';

export function QuizOverlay() {
  const { quiz, self } = useGameState();
  const [answer, setAnswer] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!quiz) return;
    setAnswer('');
    setError('');
    setBusy(false);
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [quiz?.encounterId]);

  if (!quiz || !self) return null;
  const activeQuiz = quiz;
  const isTarget = quiz.targetPlayerId === self.id;
  const helperLocked = !isTarget && now < quiz.helpersUnlockAt;
  const attempted = quiz.attemptedPlayerIds.includes(self.id);
  const remaining = Math.max(0, quiz.expiresAt - now);
  const duration = quiz.expiresAt - quiz.startedAt;
  const submit = (value: string) => {
    if (!value.trim() || attempted || helperLocked) return;
    gameNetwork.send({ type: 'quiz-answer', encounterId: quiz.encounterId, answer: value.trim() });
    setBusy(true);
  };

  async function speakPrompt() {
    try {
      const blob = await api.tts(activeQuiz.question.prompt, activeQuiz.question.language);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speech playback failed.');
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      chunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > 2 * 1024 * 1024) return setError('Recording exceeded 2 MB. Try a shorter answer.');
        setBusy(true);
        void api.voiceAnswer(activeQuiz.encounterId, blob).catch((caught) => { setBusy(false); setError(caught instanceof Error ? caught.message : 'Transcription failed.'); });
      });
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 15_000);
    } catch {
      setError('Microphone permission is required for a voice answer.');
    }
  }

  return (
    <section className={`quiz-overlay ${quiz.lethal ? 'lethal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="quiz-title">
      <div className="quiz-stasis-ring"><i /><i /><i /></div>
      <div className="quiz-card panel-grain">
        <header>
          <div><small>{quiz.lethal ? 'LETHAL KNOWLEDGE GATE' : isTarget ? 'ENCOUNTER CHECK' : 'SHARED QUESTION'}</small><strong>{isTarget ? 'Your answer changes the fight' : 'Another exile is held in stasis'}</strong></div>
          <span className="quiz-timer"><b>{Math.ceil(remaining / 1000)}</b>s<i><em style={{ width: `${(remaining / duration) * 100}%` }} /></i></span>
        </header>
        <div className="quiz-source"><span>{quiz.question.language.toUpperCase()}</span><button onClick={() => void speakPrompt()} aria-label="Read question aloud">Listen</button></div>
        <h2 id="quiz-title">{quiz.question.prompt}</h2>
        {quiz.question.type === 'mcq' && (
          <div className="quiz-options">
            {quiz.question.options?.map((option, index) => (
              <button key={option.id} disabled={attempted || helperLocked || busy} onClick={() => submit(option.id)}><kbd>{String.fromCharCode(65 + index)}</kbd><span>{option.text}</span></button>
            ))}
          </div>
        )}
        {quiz.question.type === 'text' && (
          <form className="quiz-text" onSubmit={(event) => { event.preventDefault(); submit(answer); }}>
            <input autoFocus value={answer} maxLength={500} onChange={(event) => setAnswer(event.target.value)} disabled={attempted || helperLocked || busy} placeholder="Write the answer exactly enough to be recognized" />
            <button className="primary-button" disabled={!answer.trim() || attempted || helperLocked || busy}>Release answer</button>
          </form>
        )}
        {quiz.question.type === 'voice' && (
          <div className="voice-answer"><button className={recording ? 'recording' : ''} disabled={attempted || helperLocked || busy} onClick={() => recording ? recorderRef.current?.stop() : void startRecording()}><i /><strong>{recording ? 'Stop and send' : 'Hold the answer in your voice'}</strong><small>{recording ? 'Recording · maximum 15 seconds' : 'German Whisper · audio deleted after transcription'}</small></button></div>
        )}
        {helperLocked && <p className="helper-lock"><span>{Math.max(1, Math.ceil((quiz.helpersUnlockAt - now) / 1000))}</span> Observe first. You can answer after the target has three seconds.</p>}
        {attempted && <p className="helper-lock answered"><span>✓</span> Your one answer is sealed. Another participant may still resolve the gate.</p>}
        {busy && !attempted && <p className="helper-lock answered"><span>…</span> Sending your answer to the authoritative encounter.</p>}
        {error && <p className="form-error">{error}</p>}
        <footer><span>{quiz.participantIds.length} exile{quiz.participantIds.length === 1 ? '' : 's'} can see this question</span><strong>{quiz.lethal ? 'Failure invokes normal death loss' : 'Failure burdens damage and cooldowns for 45s'}</strong></footer>
      </div>
    </section>
  );
}

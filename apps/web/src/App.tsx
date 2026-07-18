import { useEffect, useState } from 'react';
import type { Appearance } from '@boe/contracts';
import { api, ApiError } from './api';
import { Game } from './ui/Game';
import type { CharacterSummary, MaterialSummary, SessionPayload } from './types';

type AppState =
  | { phase: 'loading' }
  | { phase: 'auth'; message?: string }
  | { phase: 'character'; session: SessionPayload }
  | { phase: 'material'; session: SessionPayload & { character: CharacterSummary }; materials: MaterialSummary[] }
  | { phase: 'game'; session: SessionPayload & { character: CharacterSummary }; materials: MaterialSummary[] };

export function App() {
  const [state, setState] = useState<AppState>({ phase: 'loading' });

  async function enterSession(session: SessionPayload) {
    if (!session.character) {
      setState({ phase: 'character', session });
      return;
    }
    const materials = session.materials ?? (await api.materials());
    const nextSession = { ...session, character: session.character };
    setState(
      materials.length === 0
        ? { phase: 'material', session: nextSession, materials }
        : { phase: 'game', session: nextSession, materials },
    );
  }

  useEffect(() => {
    let cancelled = false;
    void api
      .session()
      .then((session) => {
        if (cancelled) return;
        void enterSession(session);
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof ApiError && error.status !== 401 ? error.message : null;
          setState(message ? { phase: 'auth', message } : { phase: 'auth' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') return <LoadingScreen />;
  if (state.phase === 'auth') {
    return (
      <AuthScreen
        {...(state.message ? { initialMessage: state.message } : {})}
        onAuthenticated={enterSession}
      />
    );
  }
  if (state.phase === 'character') {
    return (
      <CharacterScreen
        onCreated={(character) =>
          setState({ phase: 'material', session: { ...state.session, character }, materials: [] })
        }
      />
    );
  }
  if (state.phase === 'material') {
    return (
      <MaterialScreen
        character={state.session.character}
        existing={state.materials}
        onReady={(materials) => setState({ phase: 'game', session: state.session, materials })}
      />
    );
  }
  return (
    <Game
      character={state.session.character}
      materials={state.materials}
      onLogout={async () => {
        await api.logout().catch(() => undefined);
        setState({ phase: 'auth' });
      }}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <BloodMark />
      <p className="eyebrow">Blood of the Exiled</p>
      <div className="loading-line"><span /></div>
      <p className="muted">Listening for the forest…</p>
    </main>
  );
}

function AuthScreen({
  onAuthenticated,
  initialMessage,
}: {
  onAuthenticated: (session: SessionPayload) => Promise<void>;
  initialMessage?: string;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage ?? '');

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const username = String(data.get('username') ?? '');
      const password = String(data.get('password') ?? '');
      const session =
        mode === 'register'
          ? await api.register({ username, password, inviteCode: String(data.get('inviteCode') ?? '') })
          : await api.login({ username, password });
      await onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding auth-layout">
      <section className="auth-art" aria-label="Blood of the Exiled introduction">
        <div className="forest-rings" />
        <BloodMark />
        <p className="eyebrow">A shared world of refusal</p>
        <h1>Knowledge is not<br />the Concord’s to keep.</h1>
        <p className="lede">
          Wake with nothing. Learn what was hidden. Build with other exiles. Lose what you risk.
        </p>
        <div className="pillar-row">
          <span>Action combat</span><span>Real loss</span><span>Shared liberation</span>
        </div>
      </section>
      <section className="auth-card panel-grain">
        <p className="eyebrow">Great Forest · V1</p>
        <h2>{mode === 'login' ? 'Return to exile' : 'Take the blood-mark'}</h2>
        <p className="muted">One account. One exile. Invite access only.</p>
        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
        </div>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <label>Username<input name="username" minLength={3} maxLength={24} autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" minLength={10} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
          {mode === 'register' && <label>Invite code<input name="inviteCode" autoComplete="off" required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Carving the mark…' : mode === 'login' ? 'Enter the forest' : 'Create account'}</button>
        </form>
        <p className="smallprint">Desktop Chrome, Firefox, or Safari · WebGL2 · keyboard and mouse</p>
      </section>
    </main>
  );
}

function CharacterScreen({ onCreated }: { onCreated: (character: CharacterSummary) => void }) {
  const [appearance, setAppearance] = useState<Appearance>('warrior');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const appearances: Array<{ id: Appearance; name: string; note: string }> = [
    { id: 'warrior', name: 'Ash Warrior', note: 'Weathered leather · open helm' },
    { id: 'warrior_female', name: 'Wildbound', note: 'Layered cloth · lighter silhouette' },
    { id: 'knight', name: 'Oathbreaker', note: 'Reclaimed plate · closed helm' },
  ];
  return (
    <main className="onboarding character-layout">
      <header className="onboarding-header"><BloodMark /><div><p className="eyebrow">Create your exile</p><h1>No chosen one. No inherited rank.</h1></div></header>
      <section className="character-grid" role="radiogroup" aria-label="Appearance">
        {appearances.map((option, index) => (
          <button
            key={option.id}
            className={`character-card ${appearance === option.id ? 'selected' : ''}`}
            onClick={() => setAppearance(option.id)}
            role="radio"
            aria-checked={appearance === option.id}
          >
            <span className={`character-silhouette variant-${index + 1}`}><i /><b /></span>
            <span className="character-index">0{index + 1}</span>
            <strong>{option.name}</strong>
            <small>{option.note}</small>
          </button>
        ))}
      </section>
      <form
        className="creation-form panel-grain"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          void api
            .createCharacter({
              name: String(data.get('name') ?? ''),
              appearance,
              subject: String(data.get('subject') ?? ''),
            })
            .then(onCreated)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Character creation failed.'))
            .finally(() => setBusy(false));
        }}
      >
        <label>Exile name<input name="name" minLength={3} maxLength={24} placeholder="A name you chose" required /></label>
        <label>Learning subject<input name="subject" minLength={2} maxLength={80} placeholder="German vocabulary, TypeScript, history…" required /></label>
        <div className="class-lock"><span>Mechanical class</span><strong>Warrior</strong><small>All appearances share the complete V1 warrior kit.</small></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? 'Binding character…' : 'Choose this exile'}</button>
      </form>
    </main>
  );
}

function MaterialScreen({
  character,
  existing,
  onReady,
}: {
  character: CharacterSummary;
  existing: MaterialSummary[];
  onReady: (materials: MaterialSummary[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<'en' | 'de'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasExistingMaterials = existing.length > 0;
  return (
    <main className="onboarding material-layout">
      <section className="material-copy">
        <BloodMark />
        <p className="eyebrow">Your knowledge enters the world</p>
        <h1>Give the forest something worth remembering.</h1>
        <p className="lede">Your source becomes study prompts, combat advantages, and rare lethal questions. Live grading is deterministic. The raw upload is never retained.</p>
        <dl className="material-rules">
          <div><dt>Accepted</dt><dd>.md · .txt · text PDF</dd></div>
          <div><dt>Limit</dt><dd>No fixed file or text cap</dd></div>
          <div><dt>Generated</dt><dd>50 verified questions initially</dd></div>
          <div><dt>Privacy</dt><dd>Encrypted source · raw file deleted</dd></div>
        </dl>
      </section>
      <section className="upload-card panel-grain">
        <p className="eyebrow">Subject · {character.subject}</p>
        <h2>{hasExistingMaterials ? 'Learning material saved' : 'First learning material'}</h2>
        {hasExistingMaterials && (
          <div className="saved-materials">
            {existing.map((material) => (
              <span key={material.id}>
                <strong>{material.title}</strong>
                <small>{material.status}</small>
              </span>
            ))}
          </div>
        )}
        {hasExistingMaterials && (
          <button className="secondary-button" onClick={() => onReady(existing)}>
            Continue with saved questions
          </button>
        )}
        <label className={`file-drop ${file ? 'has-file' : ''}`}>
          <input
            type="file"
            accept=".md,.txt,.pdf,text/plain,text/markdown,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="file-rune">⌁</span>
          <strong>{file ? file.name : 'Choose a source file'}</strong>
          <small>{file ? `${(file.size / 1024).toFixed(0)} KB ready for extraction` : 'Text-based learning notes work best'}</small>
        </label>
        <label>Question language<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'de')}><option value="en">English</option><option value="de">German</option></select></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button
          className="primary-button"
          disabled={!file || busy}
          onClick={() => {
            if (!file) return;
            setBusy(true);
            setError('');
            void api
              .uploadMaterial({ file, subject: character.subject, language })
              .then((material) => onReady([...existing, material]))
              .catch((caught) => setError(caught instanceof Error ? caught.message : 'Upload failed.'))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Extracting and sealing…' : 'Bind material and wake'}
        </button>
        <p className="smallprint">Question generation continues in the background. A field primer keeps the game playable while it completes.</p>
      </section>
    </main>
  );
}

function BloodMark() {
  return <span className="blood-mark" aria-hidden="true"><i /><i /><i /></span>;
}

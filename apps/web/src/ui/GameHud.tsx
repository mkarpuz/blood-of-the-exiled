import { useEffect, useRef, useState } from 'react';
import type { ItemId, ItemStack } from '@boe/contracts';
import { ABILITIES, ITEMS, XP_THRESHOLDS } from '@boe/game-data';
import { gameStore, useGameState } from '../game-store';
import { gameNetwork } from '../network';
import type { MaterialSummary } from '../types';
import { Panels } from './Panels';
import { QuizOverlay } from './QuizOverlay';

export function GameHud({ materials, onLogout }: { materials: MaterialSummary[]; onLogout: () => Promise<void> }) {
  const state = useGameState();
  const self = state.self;
  if (!self) return <div className="world-loading"><span /><strong>Entering the Great Forest</strong></div>;
  const xpStart = XP_THRESHOLDS[self.level] ?? 0;
  const xpEnd = XP_THRESHOLDS[Math.min(10, self.level + 1)] ?? xpStart;
  const xpRatio = self.level >= 10 ? 1 : (self.xp - xpStart) / Math.max(1, xpEnd - xpStart);
  return (
    <div className="hud" data-dead={self.dead || undefined}>
      <div className="top-vignette" />
      <header className="hud-top">
        <section className="identity-plate">
          <span className="portrait-rune">{self.username.slice(0, 1).toUpperCase()}</span>
          <div><small>Level {self.level} · Warrior</small><strong>{self.username}</strong></div>
          <ConnectionPip connection={state.connection} latency={state.latency} />
        </section>
        <QuestTracker stage={self.questStage} worldState={state.world?.outpost} />
        <Minimap />
      </header>

      <div className="reticle" aria-hidden="true"><i /><i /></div>
      {state.nearby && !state.panel && !state.quiz && !self.dead && (
        <div className="interact-prompt"><kbd>E</kbd><span>{state.nearby.label}</span></div>
      )}
      <CombatTextLayer />
      <NotificationStack />

      <footer className="hud-bottom">
        <Chat />
        <div className="combat-cluster">
          <div className="bars">
            <ResourceBar className="health" value={self.health} max={self.maxHealth} label="Vitality" />
            <ResourceBar className="focus" value={self.focus} max={100} label="Focus" />
            <ResourceBar className="stamina" value={self.stamina} max={self.maxStamina} label="Stamina" />
          </div>
          <ActionBar />
          <div className="xp-track"><span style={{ width: `${Math.max(0, Math.min(100, xpRatio * 100))}%` }} /><small>{self.level >= 10 ? 'V1 level cap' : `${self.xp - xpStart} / ${xpEnd - xpStart} XP`}</small></div>
        </div>
        <QuickMenu />
      </footer>

      <Panels materials={materials} onLogout={onLogout} />
      <QuizOverlay />
      <QuizResolution />
      {self.dead && <DeathScreen />}
    </div>
  );
}

function ConnectionPip({ connection, latency }: { connection: string; latency: number }) {
  return <span className={`connection-pip ${connection}`} title={`${connection} · ${latency} ms`}><i />{connection === 'online' ? `${latency} ms` : connection}</span>;
}

const questText: Record<string, { kicker: string; title: string; note: string }> = {
  wake: { kicker: 'The Exile’s Road I', title: 'Find the Free Territory', note: 'Follow the amber path and the warm fire through the western trees.' },
  reach_refuge: { kicker: 'The Exile’s Road II', title: 'Enter the refuge', note: 'No gatekeeper waits. Walk into the firelight.' },
  study: { kicker: 'The Exile’s Road II', title: 'Study at the mentor’s shrine', note: 'Find Sera beside the stone shrine and answer once.' },
  craft_weapon: { kicker: 'The Exile’s Road III', title: 'Craft your first weapon', note: 'Gather 3 ash wood and 2 river stone. Use the anvil.' },
  free_creature: { kicker: 'The Exile’s Road IV', title: 'Break the creature’s brand', note: 'A corrupted boar is caged inside the eastern outpost.' },
  face_inquisitor: { kicker: 'The Exile’s Road V', title: 'Face the inquisitor', note: 'The keeper of stolen knowledge waits beneath the red standard.' },
  recover: { kicker: 'The Exile’s Road VI', title: 'Begin again', note: 'Gather, craft, trade, or accept another exile’s help.' },
  liberate_outpost: { kicker: 'The Exile’s Road VII', title: 'Tear down the red standard', note: 'Defeat most defenders, then touch the standard at the camp’s center.' },
  complete: { kicker: 'The Exile’s Road', title: 'No rank is recognized here', note: 'Explore secrets, help another exile, and prepare for reclamation.' },
};

function QuestTracker({ stage, worldState }: { stage: string; worldState: string | undefined }) {
  const quest = questText[stage] ?? questText.wake!;
  return (
    <section className="quest-tracker">
      <div><small>{quest.kicker}</small><strong>{quest.title}</strong><p>{quest.note}</p></div>
      {worldState && <span className={`world-state ${worldState}`}>{worldState}</span>}
    </section>
  );
}

function Minimap() {
  const { self, entities, world } = useGameState();
  const [expanded, setExpanded] = useState(false);
  if (!self) return null;
  const markerStyle = (x: number, z: number) => ({ left: `${((x + 256) / 512) * 100}%`, top: `${((256 - z) / 512) * 100}%` });
  return (
    <button className={`minimap ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded((value) => !value)} aria-label="Toggle minimap size">
      <span className="map-grid" />
      <i className="map-landmark refuge" style={markerStyle(-142, 116)} title="Free Territory" />
      <i className="map-landmark tree" style={markerStyle(-6, -2)} title="Giant Tree" />
      <i className={`map-landmark outpost ${world?.outpost ?? ''}`} style={markerStyle(151, -74)} title="Concord outpost" />
      {entities.filter((entity) => entity.kind === 'player').map((entity) => <i key={entity.id} className="map-player remote" style={markerStyle(entity.position.x, entity.position.z)} />)}
      <i className="map-player self" style={{ ...markerStyle(self.position.x, self.position.z), transform: `translate(-50%, -50%) rotate(${self.yaw}rad)` }} />
      <span className="map-north">N</span>
      <span className="map-label">Great Forest</span>
    </button>
  );
}

function ResourceBar({ className, value, max, label }: { className: string; value: number; max: number; label: string }) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return <div className={`resource-bar ${className}`} aria-label={`${label}: ${Math.round(value)} of ${Math.round(max)}`}><span style={{ width: `${ratio * 100}%` }} /><b>{label}</b><small>{Math.round(value)} / {Math.round(max)}</small></div>;
}

function ActionBar() {
  const { self } = useGameState();
  if (!self) return null;
  const tonic = self.inventory.find((item) => item.itemId === 'forest_tonic');
  const actions = [
    { key: 'LMB', name: 'Cut', detail: 'Light attack', unlocked: true },
    { key: 'Q', name: 'Rend', detail: 'Heavy attack', unlocked: true },
    ...ABILITIES.map((ability, index) => ({ key: String(index + 1), name: ability.name, detail: `Lv ${ability.unlockLevel}`, unlocked: self.level >= ability.unlockLevel })),
    { key: 'R', name: 'Tonic', detail: tonic ? `×${tonic.quantity}` : 'Empty', unlocked: Boolean(tonic) },
  ];
  return <div className="action-bar">{actions.map((action) => <div key={action.key} className={`action-slot ${action.unlocked ? '' : 'locked'}`}><kbd>{action.key}</kbd><i className={`action-glyph glyph-${action.name.toLowerCase().replaceAll(' ', '-')}`} /><strong>{action.name}</strong><small>{action.detail}</small></div>)}</div>;
}

function QuickMenu() {
  return (
    <nav className="quick-menu" aria-label="Game panels">
      <button onClick={() => gameStore.setPanel('inventory')}><kbd>Tab</kbd><span>Inventory</span></button>
      <button onClick={() => gameStore.setPanel('social')}><kbd>O</kbd><span>Exiles</span></button>
      <button onClick={() => gameStore.setPanel('map')}><kbd>M</kbd><span>Map</span></button>
      <button onClick={() => gameNetwork.send({ type: 'respawn' })}><kbd>Fix</kbd><span>Unstuck</span></button>
      <button onClick={() => gameStore.setPanel('menu')}><kbd>Esc</kbd><span>Menu</span></button>
    </nav>
  );
}

function Chat() {
  const { chat } = useGameState();
  const [channel, setChannel] = useState<'local' | 'zone'>('local');
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('boe-focus-chat', focus);
    return () => window.removeEventListener('boe-focus-chat', focus);
  }, []);
  const send = () => {
    const message = text.trim();
    if (!message) return;
    gameNetwork.send({ type: 'chat', channel, text: message });
    setText('');
    inputRef.current?.blur();
  };
  return (
    <section className="chat-box">
      <div className="chat-log" aria-live="polite">
        {chat.slice(-7).map((message) => <p key={message.id} className={message.channel}><span>{message.channel === 'system' ? '◆' : message.senderName}</span>{message.text}</p>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); send(); }}>
        <select value={channel} onChange={(event) => setChannel(event.target.value as 'local' | 'zone')} aria-label="Chat channel"><option value="local">Local</option><option value="zone">Zone</option></select>
        <input ref={inputRef} value={text} maxLength={280} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="Enter to speak" aria-label="Chat message" />
      </form>
    </section>
  );
}

function NotificationStack() {
  const { notifications } = useGameState();
  return <div className="notification-stack" aria-live="polite">{notifications.map((item) => <button key={item.id} className={`notification ${item.level}`} onClick={() => gameStore.dismissNotification(item.id)}><i /><span><strong>{item.title}</strong><small>{item.message}</small></span></button>)}</div>;
}

function CombatTextLayer() {
  const { combatTexts, self } = useGameState();
  return <div className="combat-text-layer" aria-hidden="true">{combatTexts.slice(-6).map((text, index) => <span key={text.id} className={`${text.event} ${text.targetId === self?.id ? 'received' : ''}`} style={{ marginLeft: `${(index % 3 - 1) * 42}px` }}>{text.label ?? (text.event === 'hit' ? `−${Math.round(text.amount)}` : text.event === 'heal' ? `+${Math.round(text.amount)}` : text.event)}</span>)}</div>;
}

function QuizResolution() {
  const { quizResolution } = useGameState();
  if (!quizResolution) return null;
  return <div className={`quiz-resolution ${quizResolution.status}`}><strong>{quizResolution.status === 'correct' ? 'Knowledge shared' : quizResolution.status === 'timeout' ? 'Silence is an answer' : 'The answer was withheld'}</strong>{quizResolution.correctAnswer && <span>{quizResolution.correctAnswer}</span>}{quizResolution.sourceExcerpt && <small>{quizResolution.sourceExcerpt}</small>}</div>;
}

function DeathScreen() {
  const { quizResolution } = useGameState();
  return (
    <section className="death-screen">
      <div className="death-sigil" />
      <p className="eyebrow">The forest remembers</p>
      <h1>You have fallen</h1>
      <p>Your equipped gear and on-hand gold are gone. Inventory, bank, discoveries, and knowledge remain.</p>
      {quizResolution?.correctAnswer && <blockquote><strong>{quizResolution.correctAnswer}</strong><span>{quizResolution.sourceExcerpt}</span></blockquote>}
      <button className="primary-button" onClick={() => gameNetwork.send({ type: 'respawn' })}>Wake at the Free Territory</button>
    </section>
  );
}

export function itemLabel(item: ItemStack): string {
  return `${ITEMS[item.itemId].name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
}

export function itemCount(inventory: ItemStack[], itemId: ItemId): number {
  return inventory.reduce((total, item) => total + (item.itemId === itemId ? item.quantity : 0), 0);
}

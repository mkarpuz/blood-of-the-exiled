import { useSyncExternalStore } from 'react';
import type {
  ActiveQuiz,
  EntitySnapshot,
  PlayerState,
  ServerEvent,
  WorldState,
} from '@boe/contracts';
import type { CharacterSummary } from './types';

export type Panel =
  | 'inventory'
  | 'craft'
  | 'bank'
  | 'market'
  | 'social'
  | 'map'
  | 'questions'
  | 'credits'
  | 'menu'
  | null;

export interface NearbyInteractable {
  id: string;
  label: string;
  kind: string;
  distance: number;
}

export interface NotificationItem {
  id: string;
  level: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message: string;
  createdAt: number;
}

export interface ChatItem {
  id: string;
  channel: 'local' | 'zone' | 'system';
  senderId: string | null;
  senderName: string;
  text: string;
  createdAt: number;
}

export interface CombatText {
  id: string;
  event: 'hit' | 'blocked' | 'dodged' | 'heal' | 'death' | 'xp' | 'level-up';
  amount: number;
  label: string | null;
  targetId: string;
  createdAt: number;
}

type TradeState = Extract<ServerEvent, { type: 'trade-state' }>['trade'];

export interface GameState {
  connection: 'offline' | 'connecting' | 'online' | 'reconnecting';
  self: PlayerState | null;
  character: CharacterSummary | null;
  entities: EntitySnapshot[];
  world: WorldState | null;
  quiz: ActiveQuiz | null;
  quizResolution: {
    status: 'correct' | 'wrong' | 'timeout' | 'cancelled';
    correctAnswer: string | null;
    sourceExcerpt: string | null;
  } | null;
  notifications: NotificationItem[];
  chat: ChatItem[];
  combatTexts: CombatText[];
  trade: TradeState;
  panel: Panel;
  nearby: NearbyInteractable | null;
  latency: number;
  serverTick: number;
  sessionId: string | null;
}

const initialState: GameState = {
  connection: 'offline',
  self: null,
  character: null,
  entities: [],
  world: null,
  quiz: null,
  quizResolution: null,
  notifications: [],
  chat: [],
  combatTexts: [],
  trade: null,
  panel: null,
  nearby: null,
  latency: 0,
  serverTick: 0,
  sessionId: null,
};

class GameStore {
  private state: GameState = initialState;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameState => this.state;

  reset(character: CharacterSummary): void {
    this.state = { ...initialState, character, self: character.state, connection: 'connecting' };
    this.emit();
  }

  setConnection(connection: GameState['connection']): void {
    this.patch({ connection });
  }

  setPanel(panel: Panel): void {
    this.patch({ panel: this.state.panel === panel ? null : panel });
  }

  closePanel(): void {
    this.patch({ panel: null });
  }

  setNearby(nearby: NearbyInteractable | null): void {
    const previous = this.state.nearby;
    if (previous?.id === nearby?.id && Math.abs((previous?.distance ?? 0) - (nearby?.distance ?? 0)) < 0.15) return;
    this.patch({ nearby });
  }

  addLocalNotification(level: NotificationItem['level'], title: string, message: string): void {
    const notification = { id: crypto.randomUUID(), level, title, message, createdAt: Date.now() };
    this.patch({ notifications: [...this.state.notifications.slice(-4), notification] });
    window.setTimeout(() => this.dismissNotification(notification.id), 5_500);
  }

  dismissNotification(id: string): void {
    this.patch({ notifications: this.state.notifications.filter((item) => item.id !== id) });
  }

  handleServerEvent(event: ServerEvent): void {
    const common = { serverTick: event.serverTick };
    switch (event.type) {
      case 'welcome':
        this.patch({
          ...common,
          connection: 'online',
          self: event.self,
          world: event.world,
          sessionId: event.sessionId,
        });
        break;
      case 'snapshot':
        this.patch({ ...common, self: event.self, entities: event.entities, world: event.world });
        break;
      case 'combat': {
        const combatText: CombatText = {
          id: crypto.randomUUID(),
          event: event.event,
          amount: event.amount,
          label: event.label ?? null,
          targetId: event.targetId,
          createdAt: Date.now(),
        };
        this.patch({ combatTexts: [...this.state.combatTexts.filter((item) => Date.now() - item.createdAt < 1_800), combatText] });
        window.setTimeout(() => {
          this.patch({ combatTexts: this.state.combatTexts.filter((item) => item.id !== combatText.id) });
        }, 1_900);
        break;
      }
      case 'quiz-open':
        this.patch({ quiz: event.quiz, quizResolution: null, panel: null });
        break;
      case 'quiz-update':
        if (event.status === 'helper-attempt') {
          if (event.playerId && this.state.quiz) {
            this.patch({
              quiz: {
                ...this.state.quiz,
                attemptedPlayerIds: [...new Set([...this.state.quiz.attemptedPlayerIds, event.playerId])],
              },
            });
          }
        } else {
          this.patch({
            quiz: null,
            quizResolution: {
              status: event.status,
              correctAnswer: event.correctAnswer ?? null,
              sourceExcerpt: event.sourceExcerpt ?? null,
            },
          });
          window.setTimeout(() => this.patch({ quizResolution: null }), 5_500);
        }
        break;
      case 'chat':
        this.patch({ chat: [...this.state.chat.slice(-119), event] });
        break;
      case 'notification':
        this.addLocalNotification(event.level, event.title, event.message);
        break;
      case 'trade-state':
        this.patch({ trade: event.trade, panel: event.trade ? 'social' : this.state.panel });
        break;
      case 'error':
        this.addLocalNotification(event.recoverable ? 'warning' : 'danger', 'Action refused', event.message);
        break;
      case 'pong':
        this.patch({ latency: Math.max(0, Date.now() - event.nonce) });
        break;
    }
  }

  private patch(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const gameStore = new GameStore();

export function useGameState(): GameState {
  return useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot, gameStore.getSnapshot);
}

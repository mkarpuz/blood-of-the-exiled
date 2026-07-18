import {
  PROTOCOL_VERSION,
  decodeServerEvent,
  type ClientCommand,
  type Vec3,
} from '@boe/contracts';
import { gameStore } from './game-store';

type ClientPayload = ClientCommand extends infer Command
  ? Command extends ClientCommand
    ? Omit<Command, 'protocolVersion' | 'seq' | 'clientTime'>
    : never
  : never;

export class GameNetwork {
  private socket: WebSocket | null = null;
  private commandSequence = 0;
  private lastServerSequence = -1;
  private reconnectAttempt = 0;
  private reconnectTimer = 0;
  private pingTimer = 0;
  private shouldReconnect = true;

  connect(): void {
    this.shouldReconnect = true;
    window.clearTimeout(this.reconnectTimer);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host =
      window.location.hostname === 'localhost' && window.location.port === '5173'
        ? 'localhost:8787'
        : window.location.host;
    const url = `${protocol}//${host}/ws`;
    gameStore.setConnection(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        socket.close(1000, 'Superseded connection');
        return;
      }
      this.lastServerSequence = -1;
      this.reconnectAttempt = 0;
      this.send({ type: 'hello', lastServerTick: gameStore.getSnapshot().serverTick || null });
      this.schedulePing();
    });
    socket.addEventListener('message', (message) => {
      try {
        const event = decodeServerEvent(String(message.data));
        if (event.seq <= this.lastServerSequence) return;
        this.lastServerSequence = event.seq;
        gameStore.handleServerEvent(event);
      } catch {
        gameStore.addLocalNotification('danger', 'Protocol error', 'The server sent an invalid message.');
      }
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      window.clearTimeout(this.pingTimer);
      this.socket = null;
      if (!this.shouldReconnect || event.code === 4001) {
        gameStore.setConnection('offline');
        return;
      }
      this.reconnectAttempt += 1;
      gameStore.setConnection('reconnecting');
      const delay = Math.min(10_000, 500 * 2 ** Math.min(5, this.reconnectAttempt));
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => socket.close());
  }

  disconnect(): void {
    this.shouldReconnect = false;
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.pingTimer);
    this.socket?.close(1000, 'Leaving game');
    this.socket = null;
    gameStore.setConnection('offline');
  }

  send(payload: ClientPayload): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const command = {
      protocolVersion: PROTOCOL_VERSION,
      seq: ++this.commandSequence,
      clientTime: Date.now(),
      ...payload,
    } as ClientCommand;
    this.socket.send(JSON.stringify(command));
    return true;
  }

  input(input: {
    inputSeq: number;
    moveX: number;
    moveZ: number;
    yaw: number;
    sprint: boolean;
    jump: boolean;
    dodge: boolean;
    block: boolean;
  }): void {
    this.send({ type: 'input', ...input });
  }

  attack(attack: 'light' | 'heavy', origin: Vec3, direction: Vec3): void {
    this.send({ type: 'attack', attack, origin, direction });
  }

  private schedulePing(): void {
    window.clearTimeout(this.pingTimer);
    this.pingTimer = window.setTimeout(() => {
      const nonce = Date.now();
      this.send({ type: 'ping', nonce });
      this.schedulePing();
    }, 10_000);
  }
}

export const gameNetwork = new GameNetwork();

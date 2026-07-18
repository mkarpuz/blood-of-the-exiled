import type { PlayerState } from '@boe/contracts';

export interface AccountSummary {
  id: string;
  username: string;
  createdAt: number;
}

export interface CharacterSummary {
  id: string;
  name: string;
  subject: string;
  state: PlayerState;
}

export interface MaterialSummary {
  id: string;
  accountId: string;
  title: string;
  subject: string;
  language: 'en' | 'de';
  characterCount: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  createdAt: number;
}

export interface SessionPayload {
  account: AccountSummary;
  character: CharacterSummary | null;
  materials?: MaterialSummary[];
}

export interface ApiErrorPayload {
  error: string;
  message: string;
}

import type { Appearance, Auction } from '@boe/contracts';
import type { ApiErrorPayload, CharacterSummary, MaterialSummary, SessionPayload } from './types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'include',
      signal: init?.signal ?? controller.signal,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new ApiError('API_TIMEOUT', 'The game server did not answer. Restart the dev server and try again.', 0);
    }
    throw caught;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      error: 'REQUEST_FAILED',
      message: `Request failed with HTTP ${response.status}`,
    }))) as ApiErrorPayload;
    throw new ApiError(payload.error, payload.message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  session: () => request<SessionPayload & { materials: MaterialSummary[] }>('/api/me'),
  register: (body: { username: string; password: string; inviteCode: string }) =>
    request<SessionPayload>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    request<SessionPayload>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  createCharacter: (body: { name: string; appearance: Appearance; subject: string }) =>
    request<CharacterSummary>('/api/character', { method: 'POST', body: JSON.stringify(body) }),
  uploadMaterial: (body: { file: File; subject: string; language: 'en' | 'de' }) => {
    const form = new FormData();
    form.append('subject', body.subject);
    form.append('language', body.language);
    form.append('file', body.file);
    return request<MaterialSummary>('/api/materials', { method: 'POST', body: form }, 120_000);
  },
  materials: () => request<MaterialSummary[]>('/api/materials'),
  questions: () => request<Array<Record<string, unknown>>>('/api/questions'),
  updateQuestion: (id: string, patch: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  auctions: () => request<Auction[]>('/api/auctions'),
  listAuction: (instanceId: string, price: number) =>
    request<Auction>('/api/auctions', { method: 'POST', body: JSON.stringify({ instanceId, price }) }),
  buyAuction: (id: string, version: number) =>
    request<Auction>(`/api/auctions/${id}/buy`, { method: 'POST', body: JSON.stringify({ version }) }),
  tts: async (text: string, language: 'en' | 'de'): Promise<Blob> => {
    const response = await fetch('/api/tts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    if (!response.ok) throw new ApiError('TTS_FAILED', 'Speech playback is unavailable.', response.status);
    return response.blob();
  },
  voiceAnswer: async (encounterId: string, audio: Blob): Promise<{ transcript: string }> => {
    const form = new FormData();
    form.append('encounterId', encounterId);
    form.append('audio', audio, 'answer.webm');
    return request<{ transcript: string }>('/api/voice-answer', { method: 'POST', body: form });
  },
};

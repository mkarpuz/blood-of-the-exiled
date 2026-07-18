import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export interface SynthesizedAudio {
  bytes: Buffer;
  contentType: string;
  cacheKey: string;
}

export class MediaService {
  private readonly audioDir = path.resolve(config.dataDir, 'audio-cache');

  async synthesize(text: string, language: 'en' | 'de'): Promise<SynthesizedAudio> {
    const normalized = text.trim().slice(0, 600);
    if (!normalized) throw new Error('EMPTY_TEXT');
    const voice = language === 'de' ? 'de_DE-thorsten-high' : 'en_US-ljspeech-high';
    const cacheKey = createHash('sha256').update(`${voice}:${normalized}`).digest('hex');
    const cachePath = path.join(this.audioDir, `${cacheKey}.audio`);
    const metaPath = path.join(this.audioDir, `${cacheKey}.type`);
    try {
      const [bytes, contentType] = await Promise.all([readFile(cachePath), readFile(metaPath, 'utf8')]);
      return { bytes, contentType, cacheKey };
    } catch {
      // Cache miss.
    }
    const response = await fetch(`${config.piperUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalized, voice }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`TTS_UNAVAILABLE_${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    let audioResponse = response;
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { media_path?: string; url?: string };
      const mediaPath = payload.media_path ?? payload.url;
      if (!mediaPath || !mediaPath.startsWith('/')) throw new Error('TTS_INVALID_RESPONSE');
      audioResponse = await fetch(new URL(mediaPath, config.piperUrl), { signal: AbortSignal.timeout(30_000) });
      if (!audioResponse.ok) throw new Error(`TTS_MEDIA_UNAVAILABLE_${audioResponse.status}`);
    }
    const bytes = Buffer.from(await audioResponse.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new Error('TTS_INVALID_AUDIO');
    const audioType = audioResponse.headers.get('content-type') ?? 'audio/wav';
    await mkdir(this.audioDir, { recursive: true });
    await Promise.all([
      writeFile(cachePath, bytes, { mode: 0o600 }),
      writeFile(metaPath, audioType, { mode: 0o600 }),
    ]);
    return { bytes, contentType: audioType, cacheKey };
  }

  async transcribe(bytes: Buffer, filename: string, contentType: string): Promise<string> {
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new Error('VOICE_FILE_TOO_LARGE');
    const form = new FormData();
    form.append(
      'audio',
      new Blob([Uint8Array.from(bytes)], { type: contentType || 'audio/webm' }),
      filename.slice(0, 100),
    );
    const response = await fetch(`${config.whisperUrl}/transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`WHISPER_UNAVAILABLE_${response.status}`);
    const payload = (await response.json()) as { text?: string };
    if (typeof payload.text !== 'string') throw new Error('WHISPER_INVALID_RESPONSE');
    return payload.text.trim().slice(0, 500);
  }
}

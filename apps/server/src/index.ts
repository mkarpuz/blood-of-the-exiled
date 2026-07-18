import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import argon2 from 'argon2';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  clientCommandSchema,
  createCharacterBodySchema,
  loginBodySchema,
  registerBodySchema,
  type PlayerState,
} from '@boe/contracts';
import { SPAWN_POINT, terrainHeight } from '@boe/game-data';
import { config } from './config.js';
import { hashToken, safeEqualString } from './crypto.js';
import { createRepository, type Repository } from './db/index.js';
import type { AccountRecord, CharacterRecord } from './db/types.js';
import { GameWorld } from './game/world.js';
import { newEquipment } from './game/inventory.js';
import { MaterialService } from './learning/materials.js';
import { MediaService } from './media.js';

const SESSION_COOKIE = 'boe_session';
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1_000;

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'boe_' });
const connections = new Gauge({
  name: 'boe_ws_connections',
  help: 'Current authenticated WebSocket connections',
  registers: [registry],
});
const commands = new Counter({
  name: 'boe_ws_commands_total',
  help: 'Validated WebSocket commands',
  labelNames: ['type'],
  registers: [registry],
});
const tickDuration = new Histogram({
  name: 'boe_world_tick_duration_ms',
  help: 'Authoritative world tick duration in milliseconds',
  buckets: [1, 2, 5, 10, 20, 35, 50, 75],
  registers: [registry],
});
const httpRequests = new Counter({
  name: 'boe_http_requests_total',
  help: 'HTTP responses by status and route',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const repository = createRepository();
await repository.init();
const materialService = new MaterialService(repository);
const mediaService = new MediaService();
const world = new GameWorld(repository, materialService, {
  onConnection: (delta) => connections.inc(delta),
  onCommand: (type) => commands.inc({ type }),
  onTick: (duration) => tickDuration.observe(duration),
});
await world.start();

const app = Fastify({
  logger: {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'body.password',
        'body.inviteCode',
        '*.deepseekApiKey',
      ],
      censor: '[redacted]',
    },
  },
  trustProxy: config.trustProxy,
  bodyLimit: 1_048_576,
  requestTimeout: 70_000,
});

await app.register(cookie, { secret: config.sessionSecret });
await app.register(cors, {
  origin: (origin, callback) => callback(null, !origin || acceptedOrigin(origin)),
  credentials: true,
});
await app.register(rateLimit, {
  max: 180,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});
await app.register(multipart, {
  limits: {
    fileSize: Infinity,
    files: 1,
    fields: 8,
    parts: 9,
  },
});

app.addHook('onResponse', async (request, reply) => {
  httpRequests.inc({
    method: request.method,
    route: request.routeOptions.url ?? 'unknown',
    status: String(reply.statusCode),
  });
});

app.setErrorHandler((error, request, reply) => {
  const code = cleanErrorCode(error);
  const expected = isExpectedError(code);
  if (!expected) request.log.error({ err: error }, 'request failed');
  const status = statusForError(code);
  void reply.status(status).send({ error: code, message: apiErrorMessage(code) });
});

app.get('/health', async () => ({ status: 'ok', service: 'blood-of-the-exiled', time: Date.now() }));
app.get('/ready', async () => ({ status: 'ready', worldTicking: true, persistence: config.databaseUrl ? 'postgres' : 'local' }));
app.get('/metrics', async (_request, reply) => {
  reply.header('content-type', registry.contentType);
  return registry.metrics();
});

app.post('/api/auth/register', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
  const body = registerBodySchema.parse(request.body);
  const inviteValid = [...config.inviteCodes].some((code) => safeEqualString(code, body.inviteCode));
  if (!inviteValid) throw new Error('INVALID_INVITE');
  const passwordHash = await argon2.hash(body.password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
  });
  const account = await repository.createAccount(body.username, passwordHash);
  await startSession(account, reply);
  reply.status(201);
  return { account: publicAccount(account), character: null };
});

app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
  const body = loginBodySchema.parse(request.body);
  const account = await repository.findAccountByUsername(body.username);
  const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXktc2FsdC0xMjM0NQ$wq9Kvp77ry5zawe2HtS1j+d2Hmxqqx++rDLwk/Yw52o';
  const valid = await argon2.verify(account?.passwordHash ?? dummyHash, body.password).catch(() => false);
  if (!account || !valid) throw new Error('INVALID_CREDENTIALS');
  await startSession(account, reply);
  const [character, materials] = await Promise.all([
    repository.getCharacterByAccount(account.id),
    repository.listMaterials(account.id),
  ]);
  return {
    account: publicAccount(account),
    character: character ? publicCharacter(character) : null,
    materials: materials.map(({ encryptedSource: _encryptedSource, ...material }) => material),
  };
});

app.post('/api/auth/logout', async (request, reply) => {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await repository.deleteSession(hashToken(token));
  reply.clearCookie(SESSION_COOKIE, cookieOptions());
  return { ok: true };
});

app.get('/api/me', async (request) => {
  const account = await authenticate(request);
  const [character, materials] = await Promise.all([
    repository.getCharacterByAccount(account.id),
    repository.listMaterials(account.id),
  ]);
  return {
    account: publicAccount(account),
    character: character ? publicCharacter(character) : null,
    materials: materials.map(({ encryptedSource: _encryptedSource, ...material }) => material),
  };
});

app.post('/api/character', async (request, reply) => {
  const account = await authenticate(request);
  const body = createCharacterBodySchema.parse(request.body);
  const existing = await repository.getCharacterByAccount(account.id);
  if (existing) throw new Error('CHARACTER_EXISTS');
  const id = randomUUID();
  const state: PlayerState = {
    id,
    username: body.name,
    appearance: body.appearance,
    position: { ...SPAWN_POINT, y: terrainHeight(SPAWN_POINT.x, SPAWN_POINT.z) },
    yaw: 1.1,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    focus: 0,
    level: 1,
    xp: 0,
    gold: 0,
    bankedGold: 0,
    inventory: [],
    bank: [],
    bankSlots: 12,
    equipment: newEquipment(),
    compromise: 0,
    questStage: 'wake',
    discoveries: [],
    buffs: [],
    dead: false,
    version: 1,
  };
  const record = await repository.createCharacter({
    id,
    accountId: account.id,
    name: body.name,
    subject: body.subject,
    state,
    lastQuizAt: 0,
    lastLethalQuizAt: 0,
  });
  reply.status(201);
  return publicCharacter(record);
});

app.post('/api/materials', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request, reply) => {
  const account = await authenticate(request);
  let file: { filename: string; mimetype: string; bytes: Buffer } | null = null;
  let subject = '';
  let language: 'en' | 'de' = 'en';
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      file = { filename: part.filename, mimetype: part.mimetype, bytes: await part.toBuffer() };
    } else if (part.fieldname === 'subject') {
      subject = String(part.value).trim().slice(0, 80);
    } else if (part.fieldname === 'language') {
      language = part.value === 'de' ? 'de' : 'en';
    }
  }
  if (!file) throw new Error('FILE_REQUIRED');
  const character = await repository.getCharacterByAccount(account.id);
  const material = await materialService.ingest({
    accountId: account.id,
    subject: subject || character?.subject || 'General study',
    language,
    filename: file.filename,
    mimeType: file.mimetype,
    bytes: file.bytes,
  });
  reply.status(202);
  const { encryptedSource: _encryptedSource, ...publicMaterial } = material;
  return publicMaterial;
});

app.get('/api/materials', async (request) => {
  const account = await authenticate(request);
  const materials = await repository.listMaterials(account.id);
  return materials.map(({ encryptedSource: _encryptedSource, ...material }) => material);
});

app.get('/api/questions', async (request) => {
  const account = await authenticate(request);
  const questions = await repository.listQuestions(account.id, true);
  return questions.map(({ accepted: _accepted, ...question }) => question);
});

const updateQuestionSchema = z
  .object({
    prompt: z.string().trim().min(5).max(500).optional(),
    enabled: z.boolean().optional(),
    accepted: z.array(z.string().trim().min(1).max(300)).min(1).max(12).optional(),
    answerDisplay: z.string().trim().min(1).max(300).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

app.patch('/api/questions/:id', async (request) => {
  const account = await authenticate(request);
  const id = z.string().uuid().parse((request.params as { id?: string }).id);
  const parsedPatch = updateQuestionSchema.parse(request.body);
  const patch: Partial<{
    prompt: string;
    enabled: boolean;
    accepted: string[];
    answerDisplay: string;
  }> = {};
  if (parsedPatch.prompt !== undefined) patch.prompt = parsedPatch.prompt;
  if (parsedPatch.enabled !== undefined) patch.enabled = parsedPatch.enabled;
  if (parsedPatch.accepted !== undefined) patch.accepted = parsedPatch.accepted;
  if (parsedPatch.answerDisplay !== undefined) patch.answerDisplay = parsedPatch.answerDisplay;
  const question = await repository.updateQuestion(account.id, id, patch);
  const { accepted: _accepted, ...publicQuestion } = question;
  return publicQuestion;
});

app.get('/api/auctions', async (request) => {
  await authenticate(request);
  return repository.listAuctions();
});

app.post('/api/auctions', async (request, reply) => {
  const account = await authenticate(request);
  const body = z.object({ instanceId: z.string().uuid(), price: z.number().int().min(1).max(1_000_000) }).parse(request.body);
  const character = await requireCharacter(account.id);
  const online = world.getOnlineCharacter(character.id);
  if (online) await repository.saveCharacter(online);
  const auction = await repository.createAuction(character.id, body.instanceId, body.price);
  const updated = await repository.getCharacterById(character.id);
  if (updated) world.replaceCharacter(updated);
  reply.status(201);
  return auction;
});

app.post('/api/auctions/:id/buy', async (request) => {
  const account = await authenticate(request);
  const auctionId = z.string().uuid().parse((request.params as { id?: string }).id);
  const { version } = z.object({ version: z.number().int().positive() }).parse(request.body);
  const character = await requireCharacter(account.id);
  const online = world.getOnlineCharacter(character.id);
  if (online) await repository.saveCharacter(online);
  const result = await repository.purchaseAuction(character.id, auctionId, version);
  world.replaceCharacter(result.buyer);
  world.replaceCharacter(result.seller);
  return result.auction;
});

app.post('/api/tts', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (request, reply) => {
  await authenticate(request);
  const body = z.object({ text: z.string().trim().min(1).max(600), language: z.enum(['en', 'de']) }).parse(request.body);
  const audio = await mediaService.synthesize(body.text, body.language);
  reply.header('content-type', audio.contentType);
  reply.header('cache-control', 'private, max-age=604800, immutable');
  reply.header('etag', `"${audio.cacheKey}"`);
  return reply.send(audio.bytes);
});

app.post('/api/voice-answer', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request) => {
  const account = await authenticate(request);
  const character = await requireCharacter(account.id);
  let encounterId = '';
  let audio: { bytes: Buffer; filename: string; mimetype: string } | null = null;
  for await (const part of request.parts({ limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2 } })) {
    if (part.type === 'file') {
      audio = { bytes: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype };
    } else if (part.fieldname === 'encounterId') {
      encounterId = String(part.value);
    }
  }
  if (!audio || !encounterId) throw new Error('VOICE_PAYLOAD_INVALID');
  const transcript = await mediaService.transcribe(audio.bytes, audio.filename, audio.mimetype);
  await world.submitVoiceAnswer(character.id, encounterId, transcript);
  return { transcript };
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

app.server.on('upgrade', (request, socket, head) => {
  void (async () => {
    try {
      const url = new URL(request.url ?? '/', config.publicOrigin);
      if (url.pathname !== '/ws') return socket.destroy();
      const origin = request.headers.origin;
      if (!origin || !acceptedOrigin(origin)) return rejectUpgrade(socket, 403, 'Origin rejected');
      const cookies = parseCookies(request.headers.cookie ?? '');
      const token = cookies[SESSION_COOKIE];
      if (!token) return rejectUpgrade(socket, 401, 'Authentication required');
      const session = await repository.findSession(hashToken(token));
      if (!session) return rejectUpgrade(socket, 401, 'Session expired');
      const character = await repository.getCharacterByAccount(session.accountId);
      if (!character) return rejectUpgrade(socket, 409, 'Character required');
      wss.handleUpgrade(request, socket, head, (webSocket) => {
        let lastSequence = -1;
        world.connect(character, webSocket);
        webSocket.on('message', (data, isBinary) => {
          const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
          if (isBinary || bytes.byteLength > 64 * 1024) return webSocket.close(1009, 'Payload too large');
          try {
            const parsed = clientCommandSchema.parse(JSON.parse(bytes.toString('utf8')));
            if (parsed.seq <= lastSequence) return;
            lastSequence = parsed.seq;
            void world.handleCommand(character.id, parsed);
          } catch {
            webSocket.close(1007, 'Invalid protocol message');
          }
        });
        webSocket.on('close', () => world.disconnect(character.id, webSocket));
        webSocket.on('error', () => world.disconnect(character.id, webSocket));
      });
    } catch {
      rejectUpgrade(socket, 400, 'Invalid upgrade');
    }
  })();
});

await app.listen({ host: config.host, port: config.port });
app.log.info(
  {
    port: config.port,
    persistence: config.databaseUrl ? 'postgres' : 'local',
    deepseekConfigured: Boolean(config.deepseekApiKey),
  },
  'Blood of the Exiled server ready',
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  wss.clients.forEach((client) => client.close(1012, 'Server restart'));
  await Promise.race([once(wss, 'close'), new Promise((resolve) => setTimeout(resolve, 1_000))]);
  await world.stop();
  await app.close();
  await repository.close();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

async function authenticate(request: FastifyRequest): Promise<AccountRecord> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw new Error('UNAUTHORIZED');
  const session = await repository.findSession(hashToken(token));
  if (!session) throw new Error('UNAUTHORIZED');
  const account = await repository.findAccountById(session.accountId);
  if (!account) throw new Error('UNAUTHORIZED');
  return account;
}

async function requireCharacter(accountId: string): Promise<CharacterRecord> {
  const character = await repository.getCharacterByAccount(accountId);
  if (!character) throw new Error('CHARACTER_REQUIRED');
  return character;
}

async function startSession(account: AccountRecord, reply: FastifyReply): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await repository.createSession(account.id, hashToken(token), Date.now() + SESSION_LIFETIME);
  reply.setCookie(SESSION_COOKIE, token, cookieOptions());
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict' as const,
    maxAge: SESSION_LIFETIME / 1_000,
  };
}

function publicAccount(account: AccountRecord) {
  return { id: account.id, username: account.username, createdAt: account.createdAt };
}

function publicCharacter(character: CharacterRecord) {
  return { id: character.id, name: character.name, subject: character.subject, state: character.state };
}

function acceptedOrigin(origin: string): boolean {
  if (origin === config.publicOrigin) return true;
  if (!config.production) {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.port === '5173';
    } catch {
      return false;
    }
  }
  return false;
}

function parseCookies(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(';')
      .map((part) => part.trim().split('='))
      .filter((parts): parts is [string, string] => Boolean(parts[0] && parts[1]))
      .map(([key, val]) => [decodeURIComponent(key), decodeURIComponent(val)]),
  );
}

function rejectUpgrade(socket: NodeJS.WritableStream & { destroy(): void }, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function cleanErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'INVALID_REQUEST';
  if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
    return 'FILE_TOO_LARGE';
  }
  const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  return message.replace(/sk-[a-zA-Z0-9]+/g, '[redacted]').replace(/[^A-Z0-9_]/gi, '_').toUpperCase().slice(0, 100);
}

function isExpectedError(code: string): boolean {
  return !['INTERNAL_ERROR', 'UNKNOWN_ERROR'].includes(code) && !code.startsWith('POSTGRES');
}

function statusForError(code: string): number {
  if (['UNAUTHORIZED', 'INVALID_CREDENTIALS'].includes(code)) return 401;
  if (code === 'INVALID_INVITE') return 403;
  if (['USERNAME_TAKEN', 'CHARACTER_EXISTS', 'NAME_TAKEN', 'STALE_AUCTION'].includes(code)) return 409;
  if (code === 'FILE_TOO_LARGE') return 413;
  if (code.includes('RATE_LIMIT')) return 429;
  if (isExpectedError(code)) return 400;
  return 500;
}

function apiErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_INVITE: 'That invite code is not valid.',
    INVALID_CREDENTIALS: 'Username or password is incorrect.',
    USERNAME_TAKEN: 'That username is already in use.',
    CHARACTER_EXISTS: 'This account already has a character.',
    NAME_TAKEN: 'That character name is already in use.',
    UNAUTHORIZED: 'Sign in to continue.',
    FILE_TOO_LARGE: 'The file exceeds the allowed size.',
    UNSUPPORTED_FILE: 'Upload a .md, .txt, or text-based .pdf file.',
    IMAGE_ONLY_PDF: 'This PDF has no extractable text.',
    ENCRYPTED_PDF: 'Encrypted PDFs are not supported.',
    INVALID_PDF: 'The PDF could not be read.',
    NOT_ENOUGH_TEXT: 'The material needs at least 30 characters of useful text.',
  };
  return messages[code] ?? code.toLowerCase().replace(/_/g, ' ');
}

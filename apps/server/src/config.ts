import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // Production injects environment variables and development can run with safe local defaults.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  CONTENT_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  INVITE_CODES: z.string().default('EXILE-V1'),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash'),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  WHISPER_URL: z.string().url().default('http://whisper:9000'),
  PIPER_URL: z.string().url().default('http://boe-tts:5000'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  DEMO_PERSISTENCE: z.enum(['true', 'false']).default('true'),
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.string().default('info'),
});

const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production');
  if (!env.CONTENT_ENCRYPTION_KEY) throw new Error('CONTENT_ENCRYPTION_KEY is required in production');
}

const localSeed = env.SESSION_SECRET ?? 'local-development-only-blood-of-the-exiled';
const localContentKey = createHash('sha256').update(`${localSeed}:content`).digest('hex');

export const config = {
  nodeEnv: env.NODE_ENV,
  host: env.HOST,
  port: env.PORT,
  publicOrigin: env.PUBLIC_ORIGIN,
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  contentEncryptionKey: Buffer.from(env.CONTENT_ENCRYPTION_KEY ?? localContentKey, 'hex'),
  inviteCodes: new Set(env.INVITE_CODES.split(',').map((code) => code.trim()).filter(Boolean)),
  deepseekApiKey: env.DEEPSEEK_API_KEY,
  deepseekModel: env.DEEPSEEK_MODEL,
  deepseekBaseUrl: env.DEEPSEEK_BASE_URL,
  whisperUrl: env.WHISPER_URL,
  piperUrl: env.PIPER_URL,
  trustProxy: env.TRUST_PROXY === 'true',
  demoPersistence: env.DEMO_PERSISTENCE === 'true',
  dataDir: env.DATA_DIR,
  logLevel: env.LOG_LEVEL,
  production: env.NODE_ENV === 'production',
} as const;

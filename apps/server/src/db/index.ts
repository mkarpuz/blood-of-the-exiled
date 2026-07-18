import { config } from '../config.js';
import { MemoryRepository } from './memory-repository.js';
import { PostgresRepository } from './postgres-repository.js';
import type { Repository } from './types.js';

export function createRepository(): Repository {
  if (config.databaseUrl) return new PostgresRepository(config.databaseUrl);
  if (config.production) throw new Error('PostgreSQL is mandatory in production');
  return new MemoryRepository();
}

export type { Repository } from './types.js';

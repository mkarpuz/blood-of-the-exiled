import type { Auction, PlayerState, Question, WorldState } from '@boe/contracts';

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  accountId: string;
  expiresAt: number;
}

export interface CharacterRecord {
  id: string;
  accountId: string;
  name: string;
  subject: string;
  state: PlayerState;
  lastQuizAt: number;
  lastLethalQuizAt: number;
}

export interface MaterialRecord {
  id: string;
  accountId: string;
  title: string;
  subject: string;
  language: 'en' | 'de';
  encryptedSource: string;
  characterCount: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  createdAt: number;
}

export interface StoredQuestion extends Question {
  accepted: string[];
  answerDisplay: string;
  seenCount: number;
  correctCount: number;
}

export interface AttemptRecord {
  characterId: string;
  questionId: string;
  correct: boolean;
  lethal: boolean;
  responseMs: number;
}

export interface CreateMaterialInput {
  accountId: string;
  title: string;
  subject: string;
  language: 'en' | 'de';
  encryptedSource: string;
  characterCount: number;
}

export interface Repository {
  init(): Promise<void>;
  close(): Promise<void>;
  createAccount(username: string, passwordHash: string): Promise<AccountRecord>;
  findAccountByUsername(username: string): Promise<AccountRecord | null>;
  findAccountById(id: string): Promise<AccountRecord | null>;
  createSession(accountId: string, tokenHash: string, expiresAt: number): Promise<SessionRecord>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  getCharacterByAccount(accountId: string): Promise<CharacterRecord | null>;
  getCharacterById(id: string): Promise<CharacterRecord | null>;
  createCharacter(record: CharacterRecord): Promise<CharacterRecord>;
  saveCharacter(record: CharacterRecord, auditAction?: string, details?: unknown): Promise<void>;
  saveCharactersAtomic(records: CharacterRecord[], auditAction: string, details?: unknown): Promise<void>;
  createMaterial(input: CreateMaterialInput): Promise<MaterialRecord>;
  updateMaterial(id: string, patch: Partial<Pick<MaterialRecord, 'status' | 'error'>>): Promise<void>;
  listMaterials(accountId: string): Promise<MaterialRecord[]>;
  saveQuestions(materialId: string, questions: StoredQuestion[]): Promise<void>;
  listQuestions(accountId: string, includeDisabled?: boolean): Promise<StoredQuestion[]>;
  updateQuestion(accountId: string, id: string, patch: Partial<Pick<StoredQuestion, 'prompt' | 'enabled' | 'accepted' | 'answerDisplay'>>): Promise<StoredQuestion>;
  recordAttempt(attempt: AttemptRecord): Promise<void>;
  getWorldState(): Promise<WorldState | null>;
  saveWorldState(state: WorldState): Promise<void>;
  listAuctions(): Promise<Auction[]>;
  createAuction(characterId: string, instanceId: string, price: number): Promise<Auction>;
  purchaseAuction(characterId: string, auctionId: string, expectedVersion: number): Promise<{ auction: Auction; buyer: CharacterRecord; seller: CharacterRecord }>;
}

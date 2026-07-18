import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Auction, ItemStack, WorldState } from '@boe/contracts';
import { ITEMS } from '@boe/game-data';
import { config } from '../config.js';
import { decryptJson, encryptJson } from '../crypto.js';
import type {
  AccountRecord,
  AttemptRecord,
  CharacterRecord,
  CreateMaterialInput,
  MaterialRecord,
  Repository,
  SessionRecord,
  StoredQuestion,
} from './types.js';

interface EncryptedQuestionRecord {
  id: string;
  materialId: string;
  content: string;
  enabled: boolean;
  verified: boolean;
  seenCount: number;
  correctCount: number;
  version: number;
}

interface DemoAuctionRecord {
  id: string;
  sellerCharacterId: string;
  item: ItemStack;
  price: number;
  expiresAt: number;
  version: number;
  status: 'active' | 'sold' | 'expired';
}

interface DemoData {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
  characters: CharacterRecord[];
  materials: MaterialRecord[];
  questions: EncryptedQuestionRecord[];
  attempts: Array<AttemptRecord & { id: string; createdAt: number }>;
  auctions: DemoAuctionRecord[];
  world: WorldState | null;
  economyAudit: Array<{ id: string; characterId: string | null; action: string; details: unknown; createdAt: number }>;
}

const emptyData = (): DemoData => ({
  accounts: [],
  sessions: [],
  characters: [],
  materials: [],
  questions: [],
  attempts: [],
  auctions: [],
  world: null,
  economyAudit: [],
});

export class MemoryRepository implements Repository {
  private data = emptyData();
  private readonly filePath = path.resolve(config.dataDir, 'demo-state.json');
  private queue: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    if (!config.demoPersistence || config.nodeEnv === 'test') return;
    try {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8')) as DemoData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  async close(): Promise<void> {
    await this.persist();
  }

  async createAccount(username: string, passwordHash: string): Promise<AccountRecord> {
    return this.exclusive(async () => {
      if (this.data.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('USERNAME_TAKEN');
      }
      const account = { id: randomUUID(), username, passwordHash, createdAt: Date.now() };
      this.data.accounts.push(account);
      return structuredClone(account);
    });
  }

  async findAccountByUsername(username: string): Promise<AccountRecord | null> {
    const account = this.data.accounts.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
    return account ? structuredClone(account) : null;
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    const account = this.data.accounts.find((candidate) => candidate.id === id);
    return account ? structuredClone(account) : null;
  }

  async createSession(accountId: string, tokenHash: string, expiresAt: number): Promise<SessionRecord> {
    return this.exclusive(async () => {
      this.data.sessions = this.data.sessions.filter((session) => session.expiresAt > Date.now());
      const session = { id: randomUUID(), tokenHash, accountId, expiresAt };
      this.data.sessions.push(session);
      return structuredClone(session);
    });
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.data.sessions.find(
      (candidate) => candidate.tokenHash === tokenHash && candidate.expiresAt > Date.now(),
    );
    return session ? structuredClone(session) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.exclusive(async () => {
      this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash);
    });
  }

  async getCharacterByAccount(accountId: string): Promise<CharacterRecord | null> {
    const character = this.data.characters.find((candidate) => candidate.accountId === accountId);
    return character ? structuredClone(character) : null;
  }

  async getCharacterById(id: string): Promise<CharacterRecord | null> {
    const character = this.data.characters.find((candidate) => candidate.id === id);
    return character ? structuredClone(character) : null;
  }

  async createCharacter(record: CharacterRecord): Promise<CharacterRecord> {
    return this.exclusive(async () => {
      if (this.data.characters.some((character) => character.accountId === record.accountId)) {
        throw new Error('CHARACTER_EXISTS');
      }
      if (this.data.characters.some((character) => character.name.toLowerCase() === record.name.toLowerCase())) {
        throw new Error('NAME_TAKEN');
      }
      this.data.characters.push(structuredClone(record));
      return structuredClone(record);
    });
  }

  async saveCharacter(record: CharacterRecord, auditAction?: string, details?: unknown): Promise<void> {
    await this.exclusive(async () => {
      const index = this.data.characters.findIndex((candidate) => candidate.id === record.id);
      if (index < 0) throw new Error('CHARACTER_NOT_FOUND');
      this.data.characters[index] = structuredClone(record);
      if (auditAction) {
        this.data.economyAudit.push({
          id: randomUUID(),
          characterId: record.id,
          action: auditAction,
          details: details ?? {},
          createdAt: Date.now(),
        });
      }
    });
  }

  async saveCharactersAtomic(records: CharacterRecord[], auditAction: string, details?: unknown): Promise<void> {
    await this.exclusive(async () => {
      for (const record of records) {
        const index = this.data.characters.findIndex((candidate) => candidate.id === record.id);
        if (index < 0) throw new Error('CHARACTER_NOT_FOUND');
        this.data.characters[index] = structuredClone(record);
      }
      this.data.economyAudit.push({
        id: randomUUID(),
        characterId: records[0]?.id ?? null,
        action: auditAction,
        details: details ?? {},
        createdAt: Date.now(),
      });
    });
  }

  async createMaterial(input: CreateMaterialInput): Promise<MaterialRecord> {
    return this.exclusive(async () => {
      const material: MaterialRecord = {
        id: randomUUID(),
        ...input,
        status: 'processing',
        error: null,
        createdAt: Date.now(),
      };
      this.data.materials.push(material);
      return structuredClone(material);
    });
  }

  async updateMaterial(
    id: string,
    patch: Partial<Pick<MaterialRecord, 'status' | 'error'>>,
  ): Promise<void> {
    await this.exclusive(async () => {
      const material = this.data.materials.find((candidate) => candidate.id === id);
      if (!material) throw new Error('MATERIAL_NOT_FOUND');
      Object.assign(material, patch);
    });
  }

  async listMaterials(accountId: string): Promise<MaterialRecord[]> {
    return structuredClone(this.data.materials.filter((material) => material.accountId === accountId));
  }

  async saveQuestions(materialId: string, questions: StoredQuestion[]): Promise<void> {
    await this.exclusive(async () => {
      for (const question of questions) {
        this.data.questions.push({
          id: question.id,
          materialId,
          content: encryptJson({
            materialId,
            type: question.type,
            prompt: question.prompt,
            options: question.options,
            language: question.language,
            sourceExcerpt: question.sourceExcerpt,
            lethalEligible: question.lethalEligible,
            accepted: question.accepted,
            answerDisplay: question.answerDisplay,
          }),
          enabled: question.enabled,
          verified: true,
          seenCount: question.seenCount,
          correctCount: question.correctCount,
          version: question.version,
        });
      }
    });
  }

  async listQuestions(accountId: string, includeDisabled = false): Promise<StoredQuestion[]> {
    const materialIds = new Set(
      this.data.materials.filter((material) => material.accountId === accountId).map((material) => material.id),
    );
    return this.data.questions
      .filter((question) => materialIds.has(question.materialId) && (includeDisabled || question.enabled))
      .map((question) => this.inflateQuestion(question));
  }

  async updateQuestion(
    accountId: string,
    id: string,
    patch: Partial<Pick<StoredQuestion, 'prompt' | 'enabled' | 'accepted' | 'answerDisplay'>>,
  ): Promise<StoredQuestion> {
    return this.exclusive(async () => {
      const materialIds = new Set(
        this.data.materials.filter((material) => material.accountId === accountId).map((material) => material.id),
      );
      const stored = this.data.questions.find((question) => question.id === id && materialIds.has(question.materialId));
      if (!stored) throw new Error('QUESTION_NOT_FOUND');
      const question = this.inflateQuestion(stored);
      Object.assign(question, patch);
      question.version += 1;
      stored.enabled = question.enabled;
      stored.version = question.version;
      stored.content = encryptJson({
        materialId: question.materialId,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        language: question.language,
        sourceExcerpt: question.sourceExcerpt,
        lethalEligible: question.lethalEligible,
        accepted: question.accepted,
        answerDisplay: question.answerDisplay,
      });
      return question;
    });
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    await this.exclusive(async () => {
      this.data.attempts.push({ ...attempt, id: randomUUID(), createdAt: Date.now() });
      const question = this.data.questions.find((candidate) => candidate.id === attempt.questionId);
      if (question) {
        question.seenCount += 1;
        if (attempt.correct) question.correctCount += 1;
      }
    });
  }

  async getWorldState(): Promise<WorldState | null> {
    return this.data.world ? structuredClone(this.data.world) : null;
  }

  async saveWorldState(state: WorldState): Promise<void> {
    await this.exclusive(async () => {
      this.data.world = structuredClone(state);
    });
  }

  async listAuctions(): Promise<Auction[]> {
    const now = Date.now();
    let changed = false;
    for (const auction of this.data.auctions) {
      if (auction.status === 'active' && auction.expiresAt <= now) {
        auction.status = 'expired';
        const seller = this.data.characters.find((character) => character.id === auction.sellerCharacterId);
        if (seller) this.addItem(seller, auction.item);
        changed = true;
      }
    }
    if (changed) await this.persist();
    return this.data.auctions
      .filter((auction) => auction.status === 'active')
      .map((auction) => this.publicAuction(auction));
  }

  async createAuction(characterId: string, instanceId: string, price: number): Promise<Auction> {
    return this.exclusive(async () => {
      const seller = this.data.characters.find((character) => character.id === characterId);
      if (!seller) throw new Error('CHARACTER_NOT_FOUND');
      const itemIndex = seller.state.inventory.findIndex((item) => item.instanceId === instanceId);
      if (itemIndex < 0) throw new Error('ITEM_NOT_FOUND');
      const item = seller.state.inventory[itemIndex];
      if (!item || ITEMS[item.itemId].category === 'material') throw new Error('ITEM_NOT_LISTABLE');
      const listingFee = Math.max(1, Math.ceil(price * 0.05));
      if (seller.state.gold < listingFee) throw new Error('NOT_ENOUGH_GOLD');
      seller.state.inventory.splice(itemIndex, 1);
      seller.state.gold -= listingFee;
      seller.state.version += 1;
      const auction: DemoAuctionRecord = {
        id: randomUUID(),
        sellerCharacterId: characterId,
        item: structuredClone(item),
        price,
        expiresAt: Date.now() + 24 * 60 * 60 * 1_000,
        version: 1,
        status: 'active',
      };
      this.data.auctions.push(auction);
      this.data.economyAudit.push({
        id: randomUUID(),
        characterId,
        action: 'auction-list',
        details: { auctionId: auction.id, itemId: item.itemId, price, listingFee },
        createdAt: Date.now(),
      });
      return this.publicAuction(auction);
    });
  }

  async purchaseAuction(
    characterId: string,
    auctionId: string,
    expectedVersion: number,
  ): Promise<{ auction: Auction; buyer: CharacterRecord; seller: CharacterRecord }> {
    return this.exclusive(async () => {
      const auction = this.data.auctions.find((candidate) => candidate.id === auctionId);
      if (!auction || auction.status !== 'active') throw new Error('AUCTION_NOT_AVAILABLE');
      if (auction.expiresAt <= Date.now()) throw new Error('AUCTION_EXPIRED');
      if (auction.version !== expectedVersion) throw new Error('STALE_AUCTION');
      if (auction.sellerCharacterId === characterId) throw new Error('OWN_AUCTION');
      const buyer = this.data.characters.find((character) => character.id === characterId);
      const seller = this.data.characters.find((character) => character.id === auction.sellerCharacterId);
      if (!buyer || !seller) throw new Error('CHARACTER_NOT_FOUND');
      if (buyer.state.gold < auction.price) throw new Error('NOT_ENOUGH_GOLD');
      if (buyer.state.inventory.length >= 24) throw new Error('INVENTORY_FULL');
      buyer.state.gold -= auction.price;
      seller.state.gold += auction.price;
      this.addItem(buyer, auction.item);
      buyer.state.version += 1;
      seller.state.version += 1;
      auction.status = 'sold';
      auction.version += 1;
      this.data.economyAudit.push({
        id: randomUUID(),
        characterId,
        action: 'auction-purchase',
        details: { auctionId, sellerId: seller.id, itemId: auction.item.itemId, price: auction.price },
        createdAt: Date.now(),
      });
      return {
        auction: this.publicAuction(auction),
        buyer: structuredClone(buyer),
        seller: structuredClone(seller),
      };
    });
  }

  private inflateQuestion(stored: EncryptedQuestionRecord): StoredQuestion {
    const content = decryptJson<Omit<StoredQuestion, 'id' | 'enabled' | 'version' | 'seenCount' | 'correctCount'>>(
      stored.content,
    );
    return {
      ...content,
      id: stored.id,
      enabled: stored.enabled,
      version: stored.version,
      seenCount: stored.seenCount,
      correctCount: stored.correctCount,
    };
  }

  private publicAuction(auction: DemoAuctionRecord): Auction {
    const seller = this.data.characters.find((character) => character.id === auction.sellerCharacterId);
    return {
      id: auction.id,
      sellerId: auction.sellerCharacterId,
      sellerName: seller?.name ?? 'Departed exile',
      item: structuredClone(auction.item),
      price: auction.price,
      expiresAt: auction.expiresAt,
      version: auction.version,
    };
  }

  private addItem(character: CharacterRecord, incoming: ItemStack): void {
    const definition = ITEMS[incoming.itemId];
    if (definition.stack > 1) {
      const existing = character.state.inventory.find((stack) => stack.itemId === incoming.itemId);
      if (existing && existing.quantity + incoming.quantity <= definition.stack) {
        existing.quantity += incoming.quantity;
        existing.version += 1;
        return;
      }
    }
    character.state.inventory.push(structuredClone(incoming));
  }

  private async exclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    let release: () => void = () => undefined;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const result = await operation();
      await this.persist();
      return result;
    } finally {
      release();
    }
  }

  private async persist(): Promise<void> {
    if (!config.demoPersistence || config.nodeEnv === 'test') return;
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await rename(tempPath, this.filePath);
  }
}

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Auction, ItemStack, PlayerState, WorldState } from '@boe/contracts';
import { ITEMS } from '@boe/game-data';
import postgres, { type Sql } from 'postgres';
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

type DbRow = Record<string, any>;

export class PostgresRepository implements Repository {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel,
    });
  }

  async init(): Promise<void> {
    const candidates = [
      new URL('../../drizzle/0000_v1.sql', import.meta.url),
      new URL('../drizzle/0000_v1.sql', import.meta.url),
    ];
    let migration: string | null = null;
    for (const candidate of candidates) {
      try {
        migration = await readFile(candidate, 'utf8');
        break;
      } catch {
        // Try the source and built layouts before failing.
      }
    }
    if (!migration) throw new Error('Could not locate PostgreSQL migration 0000_v1.sql');
    await this.sql.unsafe(migration);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async createAccount(username: string, passwordHash: string): Promise<AccountRecord> {
    try {
      const [row] = await this.sql`
        INSERT INTO accounts (id, username, password_hash)
        VALUES (${randomUUID()}, ${username}, ${passwordHash})
        RETURNING id, username, password_hash, created_at
      `;
      return this.account(row as DbRow);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new Error('USERNAME_TAKEN');
      throw error;
    }
  }

  async findAccountByUsername(username: string): Promise<AccountRecord | null> {
    const [row] = await this.sql`
      SELECT id, username, password_hash, created_at
      FROM accounts WHERE lower(username) = lower(${username}) LIMIT 1
    `;
    return row ? this.account(row as DbRow) : null;
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    const [row] = await this.sql`
      SELECT id, username, password_hash, created_at FROM accounts WHERE id = ${id} LIMIT 1
    `;
    return row ? this.account(row as DbRow) : null;
  }

  async createSession(accountId: string, tokenHash: string, expiresAt: number): Promise<SessionRecord> {
    const id = randomUUID();
    await this.sql`
      INSERT INTO sessions (id, token_hash, account_id, expires_at)
      VALUES (${id}, ${tokenHash}, ${accountId}, ${new Date(expiresAt)})
    `;
    return { id, tokenHash, accountId, expiresAt };
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.sql`
      SELECT id, token_hash, account_id, expires_at
      FROM sessions WHERE token_hash = ${tokenHash} AND expires_at > now() LIMIT 1
    `;
    return row
      ? {
          id: String(row.id),
          tokenHash: String(row.tokenHash),
          accountId: String(row.accountId),
          expiresAt: new Date(row.expiresAt as string | number | Date).getTime(),
        }
      : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
  }

  async getCharacterByAccount(accountId: string): Promise<CharacterRecord | null> {
    const [row] = await this.sql`
      SELECT id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
      FROM characters WHERE account_id = ${accountId} LIMIT 1
    `;
    return row ? this.character(row as DbRow) : null;
  }

  async getCharacterById(id: string): Promise<CharacterRecord | null> {
    const [row] = await this.sql`
      SELECT id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
      FROM characters WHERE id = ${id} LIMIT 1
    `;
    return row ? this.character(row as DbRow) : null;
  }

  async createCharacter(record: CharacterRecord): Promise<CharacterRecord> {
    try {
      await this.sql`
        INSERT INTO characters (
          id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
        ) VALUES (
          ${record.id}, ${record.accountId}, ${record.name}, ${record.subject},
          ${this.sql.json(record.state as any)}, ${record.lastQuizAt}, ${record.lastLethalQuizAt}
        )
      `;
      return structuredClone(record);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new Error('CHARACTER_EXISTS');
      throw error;
    }
  }

  async saveCharacter(record: CharacterRecord, auditAction?: string, details?: unknown): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE characters SET
          state = ${tx.json(record.state as any)},
          last_quiz_at = ${record.lastQuizAt},
          last_lethal_quiz_at = ${record.lastLethalQuizAt},
          updated_at = now()
        WHERE id = ${record.id}
      `;
      if (auditAction) {
        await tx`
          INSERT INTO economy_audit (id, character_id, action, details)
          VALUES (${randomUUID()}, ${record.id}, ${auditAction}, ${tx.json((details ?? {}) as any)})
        `;
      }
    });
  }

  async saveCharactersAtomic(records: CharacterRecord[], auditAction: string, details?: unknown): Promise<void> {
    await this.sql.begin(async (tx) => {
      const ids = records.map((record) => record.id).sort();
      await tx`SELECT id FROM characters WHERE id IN ${tx(ids)} ORDER BY id FOR UPDATE`;
      for (const record of records) {
        await tx`
          UPDATE characters SET
            state = ${tx.json(record.state as any)},
            last_quiz_at = ${record.lastQuizAt},
            last_lethal_quiz_at = ${record.lastLethalQuizAt},
            updated_at = now()
          WHERE id = ${record.id}
        `;
      }
      await tx`
        INSERT INTO economy_audit (id, character_id, action, details)
        VALUES (${randomUUID()}, ${records[0]?.id ?? null}, ${auditAction}, ${tx.json((details ?? {}) as any)})
      `;
    });
  }

  async createMaterial(input: CreateMaterialInput): Promise<MaterialRecord> {
    const material: MaterialRecord = {
      id: randomUUID(),
      ...input,
      status: 'processing',
      error: null,
      createdAt: Date.now(),
    };
    await this.sql`
      INSERT INTO materials (
        id, account_id, title, subject, language, encrypted_source, character_count, status
      ) VALUES (
        ${material.id}, ${material.accountId}, ${material.title}, ${material.subject},
        ${material.language}, ${material.encryptedSource}, ${material.characterCount}, ${material.status}
      )
    `;
    return material;
  }

  async updateMaterial(
    id: string,
    patch: Partial<Pick<MaterialRecord, 'status' | 'error'>>,
  ): Promise<void> {
    const current = await this.sql`SELECT status, error FROM materials WHERE id = ${id} LIMIT 1`;
    if (!current[0]) throw new Error('MATERIAL_NOT_FOUND');
    await this.sql`
      UPDATE materials SET
        status = ${patch.status ?? String(current[0].status)},
        error = ${patch.error === undefined ? (current[0].error as string | null) : patch.error},
        updated_at = now()
      WHERE id = ${id}
    `;
  }

  async listMaterials(accountId: string): Promise<MaterialRecord[]> {
    const rows = await this.sql`
      SELECT id, account_id, title, subject, language, encrypted_source, character_count, status, error, created_at
      FROM materials WHERE account_id = ${accountId} ORDER BY created_at DESC
    `;
    return rows.map((row) => this.material(row as DbRow));
  }

  async saveQuestions(materialId: string, questions: StoredQuestion[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      for (const question of questions) {
        const content = encryptJson({
          materialId,
          type: question.type,
          prompt: question.prompt,
          options: question.options,
          language: question.language,
          sourceExcerpt: question.sourceExcerpt,
          lethalEligible: question.lethalEligible,
          accepted: question.accepted,
          answerDisplay: question.answerDisplay,
        });
        await tx`
          INSERT INTO questions (
            id, material_id, encrypted_content, enabled, verified, seen_count, correct_count, version
          ) VALUES (
            ${question.id}, ${materialId}, ${content}, ${question.enabled}, true,
            ${question.seenCount}, ${question.correctCount}, ${question.version}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
    });
  }

  async listQuestions(accountId: string, includeDisabled = false): Promise<StoredQuestion[]> {
    const rows = await this.sql`
      SELECT q.id, q.material_id, q.encrypted_content, q.enabled, q.seen_count, q.correct_count, q.version
      FROM questions q
      JOIN materials m ON m.id = q.material_id
      WHERE m.account_id = ${accountId}
        AND q.verified = true
        AND (${includeDisabled} OR q.enabled = true)
      ORDER BY q.seen_count ASC, q.created_at ASC
    `;
    return rows.map((row) => this.inflateQuestion(row as DbRow));
  }

  async updateQuestion(
    accountId: string,
    id: string,
    patch: Partial<Pick<StoredQuestion, 'prompt' | 'enabled' | 'accepted' | 'answerDisplay'>>,
  ): Promise<StoredQuestion> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx`
        SELECT q.id, q.material_id, q.encrypted_content, q.enabled, q.seen_count, q.correct_count, q.version
        FROM questions q JOIN materials m ON m.id = q.material_id
        WHERE q.id = ${id} AND m.account_id = ${accountId} FOR UPDATE
      `;
      if (!row) throw new Error('QUESTION_NOT_FOUND');
      const question = this.inflateQuestion(row as DbRow);
      Object.assign(question, patch);
      question.version += 1;
      const content = encryptJson({
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
      await tx`
        UPDATE questions SET encrypted_content = ${content}, enabled = ${question.enabled}, version = ${question.version}
        WHERE id = ${id}
      `;
      return question;
    });
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO attempts (id, character_id, question_id, correct, lethal, response_ms)
        VALUES (${randomUUID()}, ${attempt.characterId}, ${attempt.questionId}, ${attempt.correct}, ${attempt.lethal}, ${attempt.responseMs})
      `;
      await tx`
        UPDATE questions SET
          seen_count = seen_count + 1,
          correct_count = correct_count + ${attempt.correct ? 1 : 0}
        WHERE id = ${attempt.questionId}
      `;
    });
  }

  async getWorldState(): Promise<WorldState | null> {
    const [row] = await this.sql`SELECT value FROM world_state WHERE key = 'great-forest' LIMIT 1`;
    return row ? (row.value as WorldState) : null;
  }

  async saveWorldState(state: WorldState): Promise<void> {
    await this.sql`
      INSERT INTO world_state (key, value) VALUES ('great-forest', ${this.sql.json(state as any)})
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        version = world_state.version + 1,
        updated_at = now()
    `;
  }

  async listAuctions(): Promise<Auction[]> {
    await this.reclaimExpiredAuctions();
    const rows = await this.sql`
      SELECT a.id, a.seller_character_id, c.name AS seller_name, a.item, a.price, a.expires_at, a.version
      FROM auctions a JOIN characters c ON c.id = a.seller_character_id
      WHERE a.status = 'active' AND a.expires_at > now()
      ORDER BY a.created_at DESC LIMIT 200
    `;
    return rows.map((row) => this.auction(row as DbRow));
  }

  async createAuction(characterId: string, instanceId: string, price: number): Promise<Auction> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx`
        SELECT id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
        FROM characters WHERE id = ${characterId} FOR UPDATE
      `;
      if (!row) throw new Error('CHARACTER_NOT_FOUND');
      const seller = this.character(row as DbRow);
      const itemIndex = seller.state.inventory.findIndex((item) => item.instanceId === instanceId);
      const item = seller.state.inventory[itemIndex];
      if (!item) throw new Error('ITEM_NOT_FOUND');
      if (ITEMS[item.itemId].category === 'material') throw new Error('ITEM_NOT_LISTABLE');
      const listingFee = Math.max(1, Math.ceil(price * 0.05));
      if (seller.state.gold < listingFee) throw new Error('NOT_ENOUGH_GOLD');
      seller.state.inventory.splice(itemIndex, 1);
      seller.state.gold -= listingFee;
      seller.state.version += 1;
      const id = randomUUID();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1_000;
      await tx`UPDATE characters SET state = ${tx.json(seller.state as any)}, updated_at = now() WHERE id = ${characterId}`;
      await tx`
        INSERT INTO auctions (id, seller_character_id, item, price, expires_at)
        VALUES (${id}, ${characterId}, ${tx.json(item as any)}, ${price}, ${new Date(expiresAt)})
      `;
      await tx`
        INSERT INTO economy_audit (id, character_id, action, details)
        VALUES (${randomUUID()}, ${characterId}, 'auction-list', ${tx.json({ id, itemId: item.itemId, price, listingFee })})
      `;
      return {
        id,
        sellerId: characterId,
        sellerName: seller.name,
        item,
        price,
        expiresAt,
        version: 1,
      };
    });
  }

  async purchaseAuction(
    characterId: string,
    auctionId: string,
    expectedVersion: number,
  ): Promise<{ auction: Auction; buyer: CharacterRecord; seller: CharacterRecord }> {
    return this.sql.begin(async (tx) => {
      const [auctionRow] = await tx`
        SELECT id, seller_character_id, item, price, expires_at, version, status
        FROM auctions WHERE id = ${auctionId} FOR UPDATE
      `;
      if (!auctionRow || auctionRow.status !== 'active') throw new Error('AUCTION_NOT_AVAILABLE');
      if (new Date(auctionRow.expiresAt as string | number | Date).getTime() <= Date.now()) throw new Error('AUCTION_EXPIRED');
      if (Number(auctionRow.version) !== expectedVersion) throw new Error('STALE_AUCTION');
      const sellerId = String(auctionRow.sellerCharacterId);
      if (sellerId === characterId) throw new Error('OWN_AUCTION');
      const rows = await tx`
        SELECT id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
        FROM characters WHERE id IN (${characterId}, ${sellerId}) ORDER BY id FOR UPDATE
      `;
      const buyerRow = rows.find((row) => String(row.id) === characterId);
      const sellerRow = rows.find((row) => String(row.id) === sellerId);
      if (!buyerRow || !sellerRow) throw new Error('CHARACTER_NOT_FOUND');
      const buyer = this.character(buyerRow as DbRow);
      const seller = this.character(sellerRow as DbRow);
      const price = Number(auctionRow.price);
      if (buyer.state.gold < price) throw new Error('NOT_ENOUGH_GOLD');
      if (buyer.state.inventory.length >= 24) throw new Error('INVENTORY_FULL');
      buyer.state.gold -= price;
      seller.state.gold += price;
      const item = auctionRow.item as ItemStack;
      this.addItem(buyer.state, item);
      buyer.state.version += 1;
      seller.state.version += 1;
      await tx`UPDATE characters SET state = ${tx.json(buyer.state as any)}, updated_at = now() WHERE id = ${buyer.id}`;
      await tx`UPDATE characters SET state = ${tx.json(seller.state as any)}, updated_at = now() WHERE id = ${seller.id}`;
      await tx`UPDATE auctions SET status = 'sold', version = version + 1 WHERE id = ${auctionId}`;
      await tx`
        INSERT INTO economy_audit (id, character_id, action, details)
        VALUES (${randomUUID()}, ${characterId}, 'auction-purchase', ${tx.json({ auctionId, sellerId, itemId: item.itemId, price })})
      `;
      return {
        auction: {
          id: auctionId,
          sellerId,
          sellerName: seller.name,
          item,
          price,
          expiresAt: new Date(auctionRow.expiresAt as string | number | Date).getTime(),
          version: Number(auctionRow.version) + 1,
        },
        buyer,
        seller,
      };
    });
  }

  private async reclaimExpiredAuctions(): Promise<void> {
    await this.sql.begin(async (tx) => {
      const expired = await tx`
        SELECT id, seller_character_id, item FROM auctions
        WHERE status = 'active' AND expires_at <= now() FOR UPDATE SKIP LOCKED
      `;
      for (const auction of expired) {
        const [sellerRow] = await tx`
          SELECT id, account_id, name, subject, state, last_quiz_at, last_lethal_quiz_at
          FROM characters WHERE id = ${auction.sellerCharacterId as string} FOR UPDATE
        `;
        if (sellerRow) {
          const seller = this.character(sellerRow as DbRow);
          this.addItem(seller.state, auction.item as ItemStack);
          seller.state.version += 1;
          await tx`UPDATE characters SET state = ${tx.json(seller.state as any)}, updated_at = now() WHERE id = ${seller.id}`;
        }
        await tx`UPDATE auctions SET status = 'expired', version = version + 1 WHERE id = ${auction.id as string}`;
      }
    });
  }

  private account(row: DbRow): AccountRecord {
    return {
      id: String(row.id),
      username: String(row.username),
      passwordHash: String(row.passwordHash),
      createdAt: new Date(row.createdAt as string | number | Date).getTime(),
    };
  }

  private character(row: DbRow): CharacterRecord {
    return {
      id: String(row.id),
      accountId: String(row.accountId),
      name: String(row.name),
      subject: String(row.subject),
      state: structuredClone(row.state as PlayerState),
      lastQuizAt: Number(row.lastQuizAt),
      lastLethalQuizAt: Number(row.lastLethalQuizAt),
    };
  }

  private material(row: DbRow): MaterialRecord {
    return {
      id: String(row.id),
      accountId: String(row.accountId),
      title: String(row.title),
      subject: String(row.subject),
      language: row.language === 'de' ? 'de' : 'en',
      encryptedSource: String(row.encryptedSource),
      characterCount: Number(row.characterCount),
      status: row.status as MaterialRecord['status'],
      error: row.error ? String(row.error) : null,
      createdAt: new Date(row.createdAt as string | number | Date).getTime(),
    };
  }

  private inflateQuestion(row: DbRow): StoredQuestion {
    const content = decryptJson<Omit<StoredQuestion, 'id' | 'enabled' | 'version' | 'seenCount' | 'correctCount'>>(
      String(row.encryptedContent),
    );
    return {
      ...content,
      id: String(row.id),
      enabled: Boolean(row.enabled),
      version: Number(row.version),
      seenCount: Number(row.seenCount),
      correctCount: Number(row.correctCount),
    };
  }

  private auction(row: DbRow): Auction {
    return {
      id: String(row.id),
      sellerId: String(row.sellerCharacterId),
      sellerName: String(row.sellerName),
      item: row.item as ItemStack,
      price: Number(row.price),
      expiresAt: new Date(row.expiresAt as string | number | Date).getTime(),
      version: Number(row.version),
    };
  }

  private addItem(state: PlayerState, incoming: ItemStack): void {
    const definition = ITEMS[incoming.itemId];
    const existing =
      definition.stack > 1 ? state.inventory.find((stack) => stack.itemId === incoming.itemId) : undefined;
    if (existing && existing.quantity + incoming.quantity <= definition.stack) {
      existing.quantity += incoming.quantity;
      existing.version += 1;
    } else {
      state.inventory.push(structuredClone(incoming));
    }
  }
}

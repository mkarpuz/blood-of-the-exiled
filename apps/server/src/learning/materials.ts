import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Question } from '@boe/contracts';
import { BUILTIN_QUESTIONS } from '@boe/game-data';
import { config } from '../config.js';
import { decryptText, encryptText } from '../crypto.js';
import type { Repository } from '../db/index.js';
import type { MaterialRecord, StoredQuestion } from '../db/types.js';

const generatedQuestionSchema = z.object({
  type: z.enum(['mcq', 'text', 'voice']),
  prompt: z.string().min(5).max(500),
  options: z
    .array(z.object({ id: z.string().min(1).max(16), text: z.string().min(1).max(300) }))
    .min(2)
    .max(6)
    .optional(),
  language: z.enum(['en', 'de']),
  acceptedAnswers: z.array(z.string().min(1).max(300)).min(1).max(12),
  answerDisplay: z.string().min(1).max(300),
  sourceExcerpt: z.string().min(2).max(700),
  lethalEligible: z.boolean(),
});

const generatedBatchSchema = z.object({ questions: z.array(generatedQuestionSchema).min(1).max(60) });
const verificationSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      grounded: z.boolean(),
      reason: z.string().max(300),
    }),
  ),
});

export interface UploadMaterialInput {
  accountId: string;
  subject: string;
  language: 'en' | 'de';
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export class MaterialService {
  private activeJobs = 0;
  private readonly queued: Array<() => Promise<void>> = [];

  constructor(private readonly repository: Repository) {}

  async ingest(input: UploadMaterialInput): Promise<MaterialRecord> {
    const extension = input.filename.toLowerCase().split('.').pop();
    if (!extension || !['md', 'txt', 'pdf'].includes(extension)) throw new Error('UNSUPPORTED_FILE');
    const source = await extractText(input.bytes, extension);
    if (source.length < 30) throw new Error('NOT_ENOUGH_TEXT');
    const material = await this.repository.createMaterial({
      accountId: input.accountId,
      title: input.filename.replace(/\.[^.]+$/, '').slice(0, 120),
      subject: input.subject.slice(0, 80),
      language: input.language,
      encryptedSource: encryptText(source),
      characterCount: source.length,
    });
    this.enqueue(() => this.generateInitial(material));
    return material;
  }

  async generateInitial(material: MaterialRecord): Promise<void> {
    try {
      const source = decryptText(material.encryptedSource);
      const questions = config.deepseekApiKey
        ? await this.generateWithDeepSeek(source, material, 50)
        : this.generateLocally(source, material, 50);
      if (questions.length < 10) throw new Error('Question generation produced too few verified questions');
      await this.repository.saveQuestions(material.id, questions.slice(0, 50));
      await this.repository.updateMaterial(material.id, { status: 'ready', error: null });
    } catch (error) {
      await this.repository.updateMaterial(material.id, {
        status: 'failed',
        error: cleanExternalError(error),
      });
    }
  }

  async maybeRefill(accountId: string): Promise<void> {
    const questions = await this.repository.listQuestions(accountId);
    const unseen = questions.filter((question) => question.seenCount === 0).length;
    if (unseen >= 20 || questions.length >= 250) return;
    const [material] = await this.repository.listMaterials(accountId);
    if (!material || material.status !== 'ready') return;
    this.enqueue(async () => {
      const source = decryptText(material.encryptedSource);
      const count = Math.min(30, 250 - questions.length);
      const generated = config.deepseekApiKey
        ? await this.generateWithDeepSeek(source, material, count)
        : this.generateLocally(source, material, count);
      await this.repository.saveQuestions(material.id, generated);
    });
  }

  private async generateWithDeepSeek(
    source: string,
    material: MaterialRecord,
    count: number,
  ): Promise<StoredQuestion[]> {
    const excerpt = source.slice(0, 120_000);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.deepseekModel,
            response_format: { type: 'json_object' },
            temperature: 0.25,
            max_tokens: 12_000,
            messages: [
              {
                role: 'system',
                content:
                  'You create source-grounded learning questions. Return strict JSON only. Never invent facts beyond the supplied source. Voice questions must be short and nonlethal. MCQ options use stable IDs a-d.',
              },
              {
                role: 'user',
                content: [
                  `Create exactly ${count} varied questions for subject “${material.subject}”.`,
                  'Schema: {"questions":[{"type":"mcq|text|voice","prompt":"...","options":[{"id":"a","text":"..."}],"language":"en|de","acceptedAnswers":["..."],"answerDisplay":"...","sourceExcerpt":"verbatim supporting excerpt","lethalEligible":true}]}',
                  'Use MCQ or text for lethal-eligible questions. Voice must set lethalEligible false.',
                  'SOURCE:',
                  excerpt,
                ].join('\n'),
              },
            ],
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) throw new Error(`DeepSeek generation failed with HTTP ${response.status}`);
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error('DeepSeek returned an empty response');
        const parsed = generatedBatchSchema.parse(JSON.parse(stripJsonFence(content)));
        const locallyGrounded = parsed.questions.filter(
          (question) =>
            question.type !== 'mcq' ||
            Boolean(question.options?.some((option) => question.acceptedAnswers.includes(option.id))),
        );
        const verified = await this.verifyWithDeepSeek(excerpt, locallyGrounded);
        return verified.map((question) => this.toStoredQuestion(material.id, question));
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('DeepSeek generation failed');
  }

  private async verifyWithDeepSeek(
    source: string,
    questions: z.infer<typeof generatedQuestionSchema>[],
  ): Promise<z.infer<typeof generatedQuestionSchema>[]> {
    const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 4_000,
        messages: [
          {
            role: 'system',
            content:
              'Verify whether each question, accepted answer, and source excerpt is directly supported by SOURCE. Return JSON only: {"results":[{"index":0,"grounded":true,"reason":"..."}]}. Reject ambiguity and invented facts.',
          },
          {
            role: 'user',
            content: `SOURCE:\n${source}\n\nQUESTIONS:\n${JSON.stringify(questions)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`DeepSeek verification failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek verification returned an empty response');
    const verification = verificationSchema.parse(JSON.parse(stripJsonFence(content)));
    const allowed = new Set(
      verification.results.filter((result) => result.grounded).map((result) => result.index),
    );
    return questions.filter((_, index) => allowed.has(index));
  }

  private generateLocally(source: string, material: MaterialRecord, count: number): StoredQuestion[] {
    const lines = source
      .split(/\n+/)
      .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
      .filter((line) => line.length >= 18 && line.length <= 240);
    const generated: StoredQuestion[] = [];
    for (let index = 0; index < count; index += 1) {
      const line = lines[index % Math.max(1, lines.length)] ?? source.slice(0, 180);
      const words = line.split(/\s+/).filter((word) => word.length > 3);
      const answer = words[(index * 3) % Math.max(1, words.length)]?.replace(/[^\p{L}\p{N}+#.-]/gu, '') || line;
      generated.push({
        id: randomUUID(),
        materialId: material.id,
        type: 'text',
        prompt: `Complete the source statement with its key term: ${line.replace(answer, '_____')}`,
        language: material.language,
        sourceExcerpt: line,
        lethalEligible: false,
        enabled: true,
        version: 1,
        accepted: [answer],
        answerDisplay: answer,
        seenCount: 0,
        correctCount: 0,
      });
    }
    if (lines.length < 2) {
      return BUILTIN_QUESTIONS.map((question) => ({
        id: randomUUID(),
        materialId: material.id,
        type: question.type,
        prompt: question.prompt,
        options: 'options' in question ? [...question.options] : undefined,
        language: question.language,
        sourceExcerpt: question.sourceExcerpt,
        lethalEligible: false,
        enabled: true,
        version: 1,
        accepted: [...question.accepted],
        answerDisplay: question.answerDisplay,
        seenCount: 0,
        correctCount: 0,
      }));
    }
    return generated;
  }

  private toStoredQuestion(
    materialId: string,
    question: z.infer<typeof generatedQuestionSchema>,
  ): StoredQuestion {
    const publicQuestion: Question = {
      id: randomUUID(),
      materialId,
      type: question.type,
      prompt: question.prompt,
      ...(question.options ? { options: question.options } : {}),
      language: question.language,
      sourceExcerpt: question.sourceExcerpt,
      lethalEligible: question.type === 'voice' ? false : question.lethalEligible,
      enabled: true,
      version: 1,
    };
    return {
      ...publicQuestion,
      accepted: question.acceptedAnswers,
      answerDisplay: question.answerDisplay,
      seenCount: 0,
      correctCount: 0,
    };
  }

  private enqueue(job: () => Promise<void>): void {
    this.queued.push(job);
    this.drain();
  }

  private drain(): void {
    while (this.activeJobs < 2 && this.queued.length > 0) {
      const job = this.queued.shift();
      if (!job) return;
      this.activeJobs += 1;
      void job().finally(() => {
        this.activeJobs -= 1;
        this.drain();
      });
    }
  }
}

export async function extractText(bytes: Buffer, extension: string): Promise<string> {
  if (extension === 'txt' || extension === 'md') {
    return cleanExtractedText(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  }
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' '),
      );
    }
    const text = cleanExtractedText(pages.join('\n'));
    if (text.length < 30) throw new Error('IMAGE_ONLY_PDF');
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('password')) throw new Error('ENCRYPTED_PDF');
    if (message.includes('image_only')) throw error;
    throw new Error('INVALID_PDF');
  }
}

function cleanExtractedText(value: string): string {
  return value
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function cleanExternalError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Question generation failed';
  return message.replace(/sk-[a-zA-Z0-9]+/g, '[redacted]').slice(0, 300);
}

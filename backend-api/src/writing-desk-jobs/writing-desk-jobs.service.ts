import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UpsertActiveWritingDeskJobDto } from './dto/upsert-active-writing-desk-job.dto';
import { WritingDeskJobsRepository } from './writing-desk-jobs.repository';
import {
  ActiveWritingDeskJobResource,
  WritingDeskJobSnapshot,
  WritingDeskJobFormSnapshot,
  WritingDeskJobRecord,
  WRITING_DESK_LETTER_STATUSES,
  WRITING_DESK_LETTER_TONES,
  WRITING_DESK_RESEARCH_STATUSES,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
  WritingDeskResearchStatus,
} from './writing-desk-jobs.types';
import { EncryptionService } from '../crypto/encryption.service';

@Injectable()
export class WritingDeskJobsService {
  constructor(
    private readonly repository: WritingDeskJobsRepository,
    private readonly encryption: EncryptionService,
  ) {}

  async getActiveJobForUser(userId: string): Promise<ActiveWritingDeskJobResource | null> {
    const record = await this.repository.findActiveByUserId(userId);
    if (!record) return null;
    const snapshot = await this.toSnapshot(record);
    return this.toResource(snapshot);
  }

  async upsertActiveJob(
    userId: string,
    input: UpsertActiveWritingDeskJobDto,
  ): Promise<ActiveWritingDeskJobResource> {
    const existing = await this.repository.findActiveByUserId(userId);
    const sanitized = this.sanitiseInput(input);
    const nextJobId = this.resolveJobId(existing, input.jobId);
    const payload = {
      jobId: nextJobId,
      phase: sanitized.phase,
      stepIndex: sanitized.stepIndex,
      followUpIndex: sanitized.followUpIndex,
      followUpQuestionsCiphertext: this.encryption.encryptObject(sanitized.followUpQuestions),
      formCiphertext: this.encryption.encryptObject(sanitized.form),
      followUpAnswersCiphertext: this.encryption.encryptObject(sanitized.followUpAnswers),
      notesCiphertext: sanitized.notes ? this.encryption.encryptObject(sanitized.notes) : null,
      responseId: sanitized.responseId,
      researchContentCiphertext: sanitized.researchContent ? this.encryption.encryptObject(sanitized.researchContent) : null,
      researchResponseId: sanitized.researchResponseId,
      researchStatus: sanitized.researchStatus,
      letterStatus: sanitized.letterStatus,
      letterTone: sanitized.letterTone,
      letterResponseId: sanitized.letterResponseId,
      letterContentCiphertext: sanitized.letterContent ? this.encryption.encryptObject(sanitized.letterContent) : null,
      letterReferencesCiphertext:
        sanitized.letterReferences.length > 0 ? this.encryption.encryptObject(sanitized.letterReferences) : null,
      letterJsonCiphertext: sanitized.letterJson ? this.encryption.encryptObject(sanitized.letterJson) : null,
    };

    const saved = await this.repository.upsertActiveJob(userId, payload);
    const snapshot = await this.toSnapshot(saved);
    return this.toResource(snapshot);
  }

  async deleteActiveJob(userId: string): Promise<void> {
    await this.repository.deleteActiveJob(userId);
  }

  private resolveJobId(existing: { jobId: string } | null, requestedJobId: string | undefined) {
    if (!existing) {
      return requestedJobId && this.isUuid(requestedJobId) ? requestedJobId : randomUUID();
    }
    if (requestedJobId && existing.jobId === requestedJobId) {
      return existing.jobId;
    }
    return randomUUID();
  }

  private sanitiseInput(input: UpsertActiveWritingDeskJobDto) {
    const trim = (value: string | undefined | null) => (typeof value === 'string' ? value : '');
    const trimNullable = (value: string | undefined) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const normaliseMultiline = (value: string | undefined) => {
      if (typeof value !== 'string') return null;
      const normalised = value.replace(/\r\n/g, '\n');
      return normalised.trim().length > 0 ? normalised : null;
    };

    const form: WritingDeskJobFormSnapshot = {
      issueDescription: trim(input.form?.issueDescription),
    };

    const followUpQuestions = Array.isArray(input.followUpQuestions)
      ? input.followUpQuestions.map((value) => trim(value))
      : [];

    const followUpAnswers = Array.isArray(input.followUpAnswers)
      ? input.followUpAnswers.map((value) => trim(value))
      : [];

    const maxFollowUps = followUpQuestions.length;
    const alignedAnswers = followUpAnswers.slice(0, maxFollowUps);
    while (alignedAnswers.length < maxFollowUps) {
      alignedAnswers.push('');
    }

    const stepIndex = Number.isFinite(input.stepIndex) && input.stepIndex >= 0 ? Math.floor(input.stepIndex) : 0;
    const followUpIndex =
      Number.isFinite(input.followUpIndex) && input.followUpIndex >= 0
        ? Math.min(Math.floor(input.followUpIndex), Math.max(maxFollowUps - 1, 0))
        : 0;

    const rawStatus = typeof input.researchStatus === 'string' ? input.researchStatus.trim() : '';
    const researchStatus = (WRITING_DESK_RESEARCH_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as WritingDeskResearchStatus)
      : 'idle';

    const rawLetterStatus = typeof input.letterStatus === 'string' ? input.letterStatus.trim() : '';
    const letterStatus = (WRITING_DESK_LETTER_STATUSES as readonly string[]).includes(rawLetterStatus)
      ? (rawLetterStatus as WritingDeskLetterStatus)
      : 'idle';

    const rawLetterTone = typeof input.letterTone === 'string' ? input.letterTone.trim() : '';
    const letterTone = (WRITING_DESK_LETTER_TONES as readonly string[]).includes(rawLetterTone)
      ? (rawLetterTone as WritingDeskLetterTone)
      : null;

    const letterReferences = Array.isArray(input.letterReferences)
      ? input.letterReferences
          .map((value) => trim(value))
          .filter((value) => value.length > 0)
      : [];

    return {
      phase: input.phase,
      stepIndex,
      followUpIndex,
      form,
      followUpQuestions,
      followUpAnswers: alignedAnswers,
      notes: trimNullable(input.notes),
      responseId: trimNullable(input.responseId),
      researchContent: normaliseMultiline(input.researchContent),
      researchResponseId: trimNullable(input.researchResponseId),
      researchStatus,
      letterStatus,
      letterTone,
      letterResponseId: trimNullable(input.letterResponseId),
      letterContent: normaliseMultiline(input.letterContent),
      letterReferences,
      letterJson: normaliseMultiline(input.letterJson),
    };
  }

  private async toSnapshot(record: WritingDeskJobRecord): Promise<WritingDeskJobSnapshot> {
    const updates: Record<string, string> = {};
    const form = this.decryptForm(record, updates);
    const followUpQuestions = this.decryptStringArray(record.followUpQuestionsCiphertext, updates, 'followUpQuestionsCiphertext');
    const followUpAnswers = this.decryptFollowUpAnswers(record, updates);
    const notes = this.decryptNullableString((record as any).notesCiphertext, updates, 'notesCiphertext');
    const researchContent = this.decryptNullableString(
      (record as any).researchContentCiphertext,
      updates,
      'researchContentCiphertext',
    );
    const letterContent = this.decryptNullableString((record as any).letterContentCiphertext, updates, 'letterContentCiphertext');
    const letterReferences = this.decryptNullableStringArray(
      (record as any).letterReferencesCiphertext,
      updates,
      'letterReferencesCiphertext',
    );
    const letterJson = this.decryptNullableString((record as any).letterJsonCiphertext, updates, 'letterJsonCiphertext');

    const createdAt = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);
    const updatedAt = record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt);

    await this.applyCiphertextUpdates(record.userId, updates);

    return {
      jobId: record.jobId,
      userId: record.userId,
      phase: record.phase,
      stepIndex: record.stepIndex,
      followUpIndex: record.followUpIndex,
      form,
      followUpQuestions,
      followUpAnswers,
      notes,
      responseId: record.responseId ?? null,
      researchContent,
      researchResponseId: record.researchResponseId ?? null,
      researchStatus: (record as any)?.researchStatus ?? 'idle',
      letterStatus: (record as any)?.letterStatus ?? 'idle',
      letterTone: (record as any)?.letterTone ?? null,
      letterResponseId: (record as any)?.letterResponseId ?? null,
      letterContent,
      letterReferences,
      letterJson,
      createdAt,
      updatedAt,
    };
  }

  private decryptForm(record: WritingDeskJobRecord, updates: Record<string, string>): WritingDeskJobFormSnapshot {
    if (record.formCiphertext) {
      try {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<WritingDeskJobFormSnapshot>(
          record.formCiphertext,
        );
        if (rotated) {
          updates.formCiphertext = ciphertext;
        }
        if (payload && typeof payload.issueDescription === 'string') {
          return payload;
        }
      } catch {
        // fall through to legacy/plain handling
      }
    }

    if (record.form) {
      if (typeof (record.form as any)?.issueDescription === 'string') {
        return {
          issueDescription: (record.form as any).issueDescription ?? '',
        };
      }

      const legacyIssue = [
        record.form.issueDetail ?? '',
        record.form.affectedDetail ?? '',
        record.form.backgroundDetail ?? '',
        record.form.desiredOutcome ?? '',
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
        .join('\n\n');

      return {
        issueDescription: legacyIssue,
      };
    }

    return {
      issueDescription: '',
    };
  }

  private decryptFollowUpAnswers(record: WritingDeskJobRecord, updates: Record<string, string>): string[] {
    if (record.followUpAnswersCiphertext) {
      try {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<string[]>(
          record.followUpAnswersCiphertext,
        );
        if (rotated) {
          updates.followUpAnswersCiphertext = ciphertext;
        }
        if (Array.isArray(payload)) {
          return payload.map((value) => (typeof value === 'string' ? value : ''));
        }
      } catch {
        // fall through to legacy/plain handling
      }
    }

    if (Array.isArray(record.followUpAnswers)) {
      return record.followUpAnswers.map((value) => (typeof value === 'string' ? value : ''));
    }

    return [];
  }

  private toResource(snapshot: WritingDeskJobSnapshot): ActiveWritingDeskJobResource {
    return {
      jobId: snapshot.jobId,
      phase: snapshot.phase,
      stepIndex: snapshot.stepIndex,
      followUpIndex: snapshot.followUpIndex,
      form: snapshot.form,
      followUpQuestions: snapshot.followUpQuestions,
      followUpAnswers: snapshot.followUpAnswers,
      notes: snapshot.notes ?? null,
      responseId: snapshot.responseId ?? null,
      researchContent: snapshot.researchContent ?? null,
      researchResponseId: snapshot.researchResponseId ?? null,
      researchStatus: snapshot.researchStatus,
      letterStatus: snapshot.letterStatus,
      letterTone: snapshot.letterTone ?? null,
      letterResponseId: snapshot.letterResponseId ?? null,
      letterContent: snapshot.letterContent ?? null,
      letterReferences: Array.isArray(snapshot.letterReferences) ? snapshot.letterReferences : [],
      letterJson: snapshot.letterJson ?? null,
      createdAt: snapshot.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: snapshot.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private decryptStringArray(
    ciphertext: string | undefined,
    updates: Record<string, string>,
    field: string,
  ): string[] {
    if (!ciphertext) return [];
    try {
      const { payload, ciphertext: refreshed, rotated } = this.encryption.decryptObjectWithRotation<string[]>(ciphertext);
      if (rotated) {
        updates[field] = refreshed;
      }
      if (Array.isArray(payload)) {
        return payload.map((value) => (typeof value === 'string' ? value : ''));
      }
    } catch {
      // Decryption failed
    }
    return [];
  }

  private decryptNullableString(
    ciphertext: string | null | undefined,
    updates: Record<string, string>,
    field: string,
  ): string | null {
    if (!ciphertext) return null;
    try {
      const { payload, ciphertext: refreshed, rotated } = this.encryption.decryptObjectWithRotation<string>(ciphertext);
      if (rotated) {
        updates[field] = refreshed;
      }
      return typeof payload === 'string' ? payload : null;
    } catch {
      // Decryption failed
    }
    return null;
  }

  private decryptNullableStringArray(
    ciphertext: string | null | undefined,
    updates: Record<string, string>,
    field: string,
  ): string[] {
    if (!ciphertext) return [];
    try {
      const { payload, ciphertext: refreshed, rotated } = this.encryption.decryptObjectWithRotation<string[]>(ciphertext);
      if (rotated) {
        updates[field] = refreshed;
      }
      if (Array.isArray(payload)) {
        return payload.map((value) => (typeof value === 'string' ? value : ''));
      }
    } catch {
      // Decryption failed
    }
    return [];
  }

  private async applyCiphertextUpdates(userId: string, updates: Record<string, string>): Promise<void> {
    if (Object.keys(updates).length === 0) {
      return;
    }
    await this.repository.updateCiphertexts(userId, updates);
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UpsertActiveWritingDeskJobDto } from './dto/upsert-active-writing-desk-job.dto';
import { WritingDeskJobsRepository } from './writing-desk-jobs.repository';
import {
  ActiveWritingDeskJobResource,
  WritingDeskJobSnapshot,
  WritingDeskJobFormSnapshot,
} from './writing-desk-jobs.types';

@Injectable()
export class WritingDeskJobsService {
  constructor(private readonly repository: WritingDeskJobsRepository) {}

  async getActiveJobForUser(userId: string): Promise<ActiveWritingDeskJobResource | null> {
    const snapshot = await this.repository.findActiveByUserId(userId);
    return snapshot ? this.toResource(snapshot) : null;
  }

  async upsertActiveJob(
    userId: string,
    input: UpsertActiveWritingDeskJobDto,
  ): Promise<ActiveWritingDeskJobResource> {
    const existing = await this.repository.findActiveByUserId(userId);
    const sanitized = this.sanitiseInput(input);
    const nextJobId = this.resolveJobId(existing, input.jobId);
    const payload: Omit<WritingDeskJobSnapshot, 'createdAt' | 'updatedAt'> = {
      jobId: nextJobId,
      userId,
      phase: sanitized.phase,
      stepIndex: sanitized.stepIndex,
      followUpIndex: sanitized.followUpIndex,
      form: sanitized.form,
      followUpQuestions: sanitized.followUpQuestions,
      followUpAnswers: sanitized.followUpAnswers,
      notes: sanitized.notes,
      responseId: sanitized.responseId,
    } as Omit<WritingDeskJobSnapshot, 'createdAt' | 'updatedAt'>;

    const saved = await this.repository.upsertActiveJob(userId, payload);
    return this.toResource(saved);
  }

  async deleteActiveJob(userId: string): Promise<void> {
    await this.repository.deleteActiveJob(userId);
  }

  private resolveJobId(existing: WritingDeskJobSnapshot | null, requestedJobId: string | undefined) {
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

    const form: WritingDeskJobFormSnapshot = {
      issueDetail: trim(input.form?.issueDetail),
      affectedDetail: trim(input.form?.affectedDetail),
      backgroundDetail: trim(input.form?.backgroundDetail),
      desiredOutcome: trim(input.form?.desiredOutcome),
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
    const followUpIndex = Number.isFinite(input.followUpIndex) && input.followUpIndex >= 0
      ? Math.min(Math.floor(input.followUpIndex), Math.max(maxFollowUps - 1, 0))
      : 0;

    return {
      phase: input.phase,
      stepIndex,
      followUpIndex,
      form,
      followUpQuestions,
      followUpAnswers: alignedAnswers,
      notes: trimNullable(input.notes),
      responseId: trimNullable(input.responseId),
    };
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
      createdAt: snapshot.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: snapshot.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}

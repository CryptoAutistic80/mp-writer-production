import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WritingDeskJob, WritingDeskJobDocument } from './schema/writing-desk-job.schema';
import { WritingDeskJobRecord, WritingDeskJobPhase } from './writing-desk-jobs.types';

@Injectable()
export class WritingDeskJobsRepository {
  constructor(
    @InjectModel(WritingDeskJob.name)
    private readonly model: Model<WritingDeskJobDocument>,
  ) {}

  async findActiveByUserId(userId: string): Promise<WritingDeskJobRecord | null> {
    const doc = await this.model.findOne({ userId }).lean();
    return doc ? (doc as unknown as WritingDeskJobRecord) : null;
  }

  async upsertActiveJob(
    userId: string,
    payload: {
      jobId: string;
      phase: WritingDeskJobPhase;
      stepIndex: number;
      followUpIndex: number;
      followUpQuestionsCiphertext: string;
      formCiphertext: string;
      followUpAnswersCiphertext: string;
      notesCiphertext: string | null;
      responseId: string | null;
      researchContentCiphertext: string | null;
      researchResponseId: string | null;
      researchStatus: string;
      letterStatus: string;
      letterTone: string | null;
      letterResponseId: string | null;
      letterContentCiphertext: string | null;
      letterReferencesCiphertext: string | null;
      letterJsonCiphertext: string | null;
    },
  ): Promise<WritingDeskJobRecord> {
    // Use explicit field-by-field $set for atomic updates
    // This ensures each field is updated atomically, reducing race condition impact
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            jobId: payload.jobId,
            phase: payload.phase,
            stepIndex: payload.stepIndex,
            followUpIndex: payload.followUpIndex,
            followUpQuestionsCiphertext: payload.followUpQuestionsCiphertext,
            formCiphertext: payload.formCiphertext,
            followUpAnswersCiphertext: payload.followUpAnswersCiphertext,
            notesCiphertext: payload.notesCiphertext,
            responseId: payload.responseId,
            researchContentCiphertext: payload.researchContentCiphertext,
            researchResponseId: payload.researchResponseId,
            researchStatus: payload.researchStatus,
            letterStatus: payload.letterStatus,
            letterTone: payload.letterTone,
            letterResponseId: payload.letterResponseId,
            letterContentCiphertext: payload.letterContentCiphertext,
            letterReferencesCiphertext: payload.letterReferencesCiphertext,
            letterJsonCiphertext: payload.letterJsonCiphertext,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean();
    return doc as unknown as WritingDeskJobRecord;
  }

  async deleteActiveJob(userId: string): Promise<void> {
    await this.model.deleteOne({ userId });
  }
}

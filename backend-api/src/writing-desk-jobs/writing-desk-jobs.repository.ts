import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WritingDeskJob, WritingDeskJobDocument } from './schema/writing-desk-job.schema';
import { WritingDeskJobSnapshot } from './writing-desk-jobs.types';

@Injectable()
export class WritingDeskJobsRepository {
  constructor(
    @InjectModel(WritingDeskJob.name)
    private readonly model: Model<WritingDeskJobDocument>,
  ) {}

  async findActiveByUserId(userId: string): Promise<WritingDeskJobSnapshot | null> {
    const doc = await this.model.findOne({ userId }).lean();
    return doc ? (doc as unknown as WritingDeskJobSnapshot) : null;
  }

  async upsertActiveJob(
    userId: string,
    payload: Omit<WritingDeskJobSnapshot, 'createdAt' | 'updatedAt'>,
  ): Promise<WritingDeskJobSnapshot> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            ...payload,
            userId,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean();
    return doc as unknown as WritingDeskJobSnapshot;
  }

  async deleteActiveJob(userId: string): Promise<void> {
    await this.model.deleteOne({ userId });
  }
}

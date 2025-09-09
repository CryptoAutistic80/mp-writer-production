import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserMp } from './schemas/user-mp.schema';

@Injectable()
export class UserMpService {
  constructor(@InjectModel(UserMp.name) private readonly userMpModel: Model<UserMp>) {}

  async getMine(userId: string) {
    return this.userMpModel.findOne({ user: userId }).lean();
  }

  async upsertMine(userId: string, input: { constituency: string; mp?: any | null }) {
    await this.userMpModel.updateOne(
      { user: userId },
      { $set: { constituency: input.constituency, mp: input.mp ?? null } },
      { upsert: true }
    );
    return this.getMine(userId);
  }

  async clearMine(userId: string) {
    await this.userMpModel.deleteOne({ user: userId });
    return { cleared: true };
  }
}

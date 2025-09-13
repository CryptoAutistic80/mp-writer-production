import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserCredits } from './schemas/user-credits.schema';

@Injectable()
export class UserCreditsService {
  constructor(
    @InjectModel(UserCredits.name) private readonly userCreditsModel: Model<UserCredits>,
  ) {}

  async getMine(userId: string) {
    const doc = await this.userCreditsModel.findOne({ user: userId }).lean();
    return { credits: doc?.credits ?? 0 };
  }

  async setMine(userId: string, credits: number) {
    await this.userCreditsModel.updateOne(
      { user: userId },
      { $set: { credits } },
      { upsert: true }
    );
    return this.getMine(userId);
  }

  async addToMine(userId: string, delta: number) {
    const res = await this.userCreditsModel.findOneAndUpdate(
      { user: userId },
      { $inc: { credits: delta } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { credits: res?.credits ?? 0 };
  }

  async deductFromMine(userId: string, amount: number) {
    if (amount <= 0) return this.getMine(userId);
    const updated = await this.userCreditsModel
      .findOneAndUpdate(
        { user: userId, credits: { $gte: amount } },
        { $inc: { credits: -amount } },
        { new: true }
      )
      .lean();
    if (!updated) throw new BadRequestException('Insufficient credits');
    return { credits: updated.credits };
  }
}

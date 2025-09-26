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
    return { credits: this.normaliseCredits(doc?.credits) };
  }

  async setMine(userId: string, credits: number) {
    const rounded = this.normaliseAmount(credits);
    await this.userCreditsModel.updateOne(
      { user: userId },
      { $set: { credits: rounded } },
      { upsert: true }
    );
    return this.getMine(userId);
  }

  async addToMine(userId: string, delta: number) {
    const roundedDelta = this.normaliseAmount(delta);
    if (roundedDelta === 0) return this.getMine(userId);
    const res = await this.userCreditsModel.findOneAndUpdate(
      { user: userId },
      { $inc: { credits: roundedDelta } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { credits: this.normaliseCredits(res?.credits) };
  }

  async deductFromMine(userId: string, amount: number) {
    const roundedAmount = this.normaliseAmount(amount);
    if (roundedAmount <= 0) return this.getMine(userId);
    const updated = await this.userCreditsModel
      .findOneAndUpdate(
        { user: userId, credits: { $gte: roundedAmount } },
        { $inc: { credits: -roundedAmount } },
        { new: true }
      )
      .lean();
    if (!updated) throw new BadRequestException('Insufficient credits');
    return { credits: this.normaliseCredits(updated.credits) };
  }

  private normaliseCredits(value: number | null | undefined) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  private normaliseAmount(value: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.round(value * 100) / 100;
  }
}

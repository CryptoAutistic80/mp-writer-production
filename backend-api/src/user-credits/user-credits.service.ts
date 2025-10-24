import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserCredits } from './schemas/user-credits.schema';

@Injectable()
export class UserCreditsService {
  private readonly logger = new Logger(UserCreditsService.name);

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
    
    // Atomic deduction with proper error handling
    // The query condition ensures credits >= amount BEFORE deduction
    // This is atomic in MongoDB, preventing race conditions
    const updated = await this.userCreditsModel
      .findOneAndUpdate(
        { user: userId, credits: { $gte: roundedAmount } },
        { $inc: { credits: -roundedAmount } },
        { new: true }
      )
      .lean();
    
    if (!updated) {
      // Either user doesn't exist or insufficient credits
      const current = await this.getMine(userId);
      this.logger.warn(
        `Credit deduction failed for user ${userId}: requested ${roundedAmount}, available ${current.credits}`
      );
      throw new BadRequestException('Insufficient credits');
    }
    
    this.logger.log(
      `Deducted ${roundedAmount} credits from user ${userId}, new balance: ${this.normaliseCredits(updated.credits)}`
    );
    
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

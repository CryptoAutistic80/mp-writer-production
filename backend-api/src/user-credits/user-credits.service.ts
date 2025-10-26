import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserCredits } from './schemas/user-credits.schema';
import { AuditLogService } from '../common/audit/audit-log.service';

@Injectable()
export class UserCreditsService {
  private readonly logger = new Logger(UserCreditsService.name);

  constructor(
    @InjectModel(UserCredits.name) private readonly userCreditsModel: Model<UserCredits>,
    private readonly auditService: AuditLogService,
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

  async addToMine(userId: string, delta: number, reason?: string) {
    const roundedDelta = this.normaliseAmount(delta);
    if (roundedDelta === 0) return this.getMine(userId);
    
    const balanceBefore = (await this.getMine(userId)).credits;
    const res = await this.userCreditsModel.findOneAndUpdate(
      { user: userId },
      { $inc: { credits: roundedDelta } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    const balanceAfter = this.normaliseCredits(res?.credits);
    
    // Audit log for credit addition
    this.auditService.logCreditAddition(
      { userId },
      roundedDelta,
      balanceBefore,
      balanceAfter,
      reason || 'Manual addition',
    );
    
    return { credits: balanceAfter };
  }

  async deductFromMine(userId: string, amount: number, reason?: string) {
    const roundedAmount = this.normaliseAmount(amount);
    if (roundedAmount <= 0) return this.getMine(userId);
    
    const balanceBefore = (await this.getMine(userId)).credits;
    
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
      
      // Audit log failed deduction
      this.auditService.logCreditDeduction(
        { userId },
        roundedAmount,
        balanceBefore,
        current.credits,
        false,
        'Insufficient credits',
        { reason: reason || 'Unknown' },
      );
      
      throw new BadRequestException('Insufficient credits');
    }
    
    const balanceAfter = this.normaliseCredits(updated.credits);
    
    // Audit log successful deduction
    this.auditService.logCreditDeduction(
      { userId },
      roundedAmount,
      balanceBefore,
      balanceAfter,
      true,
      undefined,
      { reason: reason || 'AI operation' },
    );
    
    this.logger.log(
      `Deducted ${roundedAmount} credits from user ${userId}, new balance: ${balanceAfter}`
    );
    
    return { credits: balanceAfter };
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

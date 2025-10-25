import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase } from './schemas/purchase.schema';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesRepository {
  private readonly logger = new Logger(PurchasesRepository.name);

  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<Purchase>,
  ) {}

  async create(userId: string, dto: CreatePurchaseDto) {
    try {
      return await this.purchaseModel.create({ 
        user: userId, 
        ...dto, 
        status: 'succeeded',
      });
    } catch (error: any) {
      // Handle duplicate key error for idempotency
      if (error.code === 11000 && error.keyPattern?.['metadata.stripeSessionId']) {
        this.logger.warn(
          `Duplicate stripeSessionId detected: ${dto.metadata?.stripeSessionId}. Returning existing purchase.`
        );
        // Return the existing purchase instead of throwing
        const existing = await this.findByStripeSession(userId, dto.metadata?.stripeSessionId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async findByStripeSession(userId: string, sessionId: string) {
    if (!sessionId) return null;
    return this.purchaseModel
      .findOne({ user: userId, 'metadata.stripeSessionId': sessionId })
      .lean()
      .exec();
  }

  async findByUser(userId: string) {
    return this.purchaseModel
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findById(userId: string, id: string) {
    return this.purchaseModel
      .findOne({ _id: id, user: userId })
      .lean()
      .exec();
  }
}



import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { Purchase } from './schemas/purchase.schema';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<Purchase>,
  ) {}

  async create(userId: string, input: { plan: string; amount: number; currency?: string; metadata?: any }) {
    return this.purchaseModel.create({ user: userId, ...input, status: 'succeeded' });
  }

  async findByStripeSession(userId: string, sessionId: string) {
    if (!sessionId) return null;
    return this.purchaseModel.findOne({ user: userId, 'metadata.stripeSessionId': sessionId }).lean();
  }

  async findMine(userId: string) {
    return this.purchaseModel.find({ user: userId }).sort({ createdAt: -1 }).lean();
  }

  async getById(userId: string, id: string) {
    return this.purchaseModel.findOne({ _id: id, user: userId }).lean();
  }
}

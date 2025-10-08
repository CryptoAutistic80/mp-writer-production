import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase } from './schemas/purchase.schema';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesRepository {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<Purchase>,
  ) {}

  async create(userId: string, dto: CreatePurchaseDto) {
    return this.purchaseModel.create({ 
      user: userId, 
      ...dto, 
      status: 'succeeded',
    });
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


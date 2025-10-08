import { Injectable } from '@nestjs/common';
import { PurchasesRepository } from './purchases.repository';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly repository: PurchasesRepository) {}

  async create(userId: string, dto: CreatePurchaseDto) {
    return this.repository.create(userId, dto);
  }

  async findByStripeSession(userId: string, sessionId: string) {
    return this.repository.findByStripeSession(userId, sessionId);
  }

  async findMine(userId: string) {
    return this.repository.findByUser(userId);
  }

  async getById(userId: string, id: string) {
    return this.repository.findById(userId, id);
  }
}

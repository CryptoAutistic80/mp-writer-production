import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { Account } from './schemas/account.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Account.name) private readonly accountModel: Model<Account>,
  ) {}

  async findById(id: string) {
    return this.userModel.findById(id).lean();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).lean();
  }

  async findOrCreateFromOAuth(input: {
    provider: string;
    providerId: string;
    email?: string;
    name?: string;
    image?: string;
  }) {
    // Try to find account mapping first
    const existingAccount = await this.accountModel
      .findOne({ provider: input.provider, providerId: input.providerId })
      .lean();
    if (existingAccount) {
      const user = await this.userModel.findById(existingAccount.user).lean();
      if (user) return user;
    }

    // Fall back to email if available
    let user = input.email ? await this.userModel.findOne({ email: input.email }) : null;
    if (!user) {
      user = await this.userModel.create({
        email: input.email ?? `${input.provider}:${input.providerId}@example.invalid`,
        name: input.name,
        image: input.image,
      });
    }

    // Ensure account mapping exists
    await this.accountModel.updateOne(
      { provider: input.provider, providerId: input.providerId },
      { $setOnInsert: { user: (user as any)._id, provider: input.provider, providerId: input.providerId } },
      { upsert: true }
    );

    // Return lean
    const lean = await this.userModel.findById((user as any)._id).lean();
    return lean;
  }
}


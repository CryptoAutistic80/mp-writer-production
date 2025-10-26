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
    // Strategy: Always prioritize provider + providerId mapping (most secure)
    // Only fall back to email lookup if account mapping doesn't exist
    // This prevents user enumeration via OAuth email discovery
    
    let user = null;
    
    // Try to find existing account mapping first
    const accountMapping = await this.accountModel
      .findOne({ provider: input.provider, providerId: input.providerId })
      .lean();
    
    if (accountMapping) {
      // Existing account mapping found - use it (most secure path)
      const existingUser = await this.userModel.findById(accountMapping.user).lean();
      if (existingUser) return existingUser;
    }
    
    // No account mapping exists - this is either:
    // 1. First-time OAuth login for this provider
    // 2. Existing user adding a new OAuth provider
    
    // Check if a user with this email already exists (to prevent duplicate accounts)
    // This lookup happens regardless to maintain consistent timing
    if (input.email) {
      const existingUserByEmail = await this.userModel.findOne({ email: input.email }).lean();
      if (existingUserByEmail) {
        // User exists with this email - link the OAuth provider
        user = existingUserByEmail;
      }
    }
    
    // If no user found by email, create a new user
    if (!user) {
      user = await this.userModel.create({
        email: input.email ?? `${input.provider}:${input.providerId}@example.invalid`,
        name: input.name,
        image: input.image,
      });
    }
    
    // Ensure account mapping exists for this provider + providerId
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


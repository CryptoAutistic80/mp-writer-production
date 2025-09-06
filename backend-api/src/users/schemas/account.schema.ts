import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

@Schema({ timestamps: true })
export class Account {
  _id!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user!: string;

  @Prop({ required: true })
  provider!: string; // e.g., 'google'

  @Prop({ required: true })
  providerId!: string; // e.g., Google profile id
}

export const AccountSchema = SchemaFactory.createForClass(Account);
AccountSchema.index({ provider: 1, providerId: 1 }, { unique: true });


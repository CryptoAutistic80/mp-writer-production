import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type PurchaseDocument = HydratedDocument<Purchase>;

export type PurchaseStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

@Schema({ timestamps: true })
export class Purchase {
  _id!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, default: 'usd' })
  currency!: string;

  @Prop({ required: true })
  plan!: string;

  @Prop({ required: true, default: 'pending' })
  status!: PurchaseStatus;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
PurchaseSchema.index({ user: 1, createdAt: -1 });
PurchaseSchema.index({ 'metadata.stripeSessionId': 1 }, { unique: true, sparse: true });


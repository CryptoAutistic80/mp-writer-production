import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserCreditsDocument = HydratedDocument<UserCredits>;

@Schema({ timestamps: true })
export class UserCredits {
  _id!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user!: string;

  @Prop({ required: true, default: 0, min: 0 })
  credits!: number;
}

export const UserCreditsSchema = SchemaFactory.createForClass(UserCredits);

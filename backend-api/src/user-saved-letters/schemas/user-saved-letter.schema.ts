import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserSavedLetterDocument = HydratedDocument<UserSavedLetter>;

@Schema({ timestamps: true })
export class UserSavedLetter {
  _id!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user!: string;

  @Prop({ type: String, required: true })
  responseId!: string;

  @Prop({ type: String, required: true })
  letterHtml!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  metadata!: Record<string, unknown>;

  @Prop({ type: String, required: true })
  tone!: string;

  @Prop({ type: [String], default: [] })
  references!: string[];

  @Prop({ type: String })
  rawJson?: string | null;

  createdAt!: Date;

  updatedAt!: Date;
}

export const UserSavedLetterSchema = SchemaFactory.createForClass(UserSavedLetter);

UserSavedLetterSchema.index({ user: 1, responseId: 1 }, { unique: true });

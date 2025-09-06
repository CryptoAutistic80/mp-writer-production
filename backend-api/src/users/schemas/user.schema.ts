import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  _id!: string;

  @Prop({ required: true, unique: true, index: true })
  email!: string;

  @Prop()
  name?: string;

  @Prop()
  image?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);


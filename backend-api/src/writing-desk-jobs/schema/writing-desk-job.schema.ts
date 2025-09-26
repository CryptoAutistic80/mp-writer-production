import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { WRITING_DESK_JOB_PHASES, WritingDeskJobPhase } from '../writing-desk-jobs.types';

@Schema({ timestamps: true })
export class WritingDeskJob {
  @Prop({ required: true, unique: true })
  jobId!: string;

  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ type: String, enum: WRITING_DESK_JOB_PHASES, required: true })
  phase!: WritingDeskJobPhase;

  @Prop({ type: Number, required: true, min: 0 })
  stepIndex!: number;

  @Prop({ type: Number, required: true, min: 0 })
  followUpIndex!: number;

  @Prop({
    type: {
      issueDetail: { type: String, default: '' },
      affectedDetail: { type: String, default: '' },
      backgroundDetail: { type: String, default: '' },
      desiredOutcome: { type: String, default: '' },
    },
    required: true,
    _id: false,
    default: {},
  })
  form!: {
    issueDetail: string;
    affectedDetail: string;
    backgroundDetail: string;
    desiredOutcome: string;
  };

  @Prop({ type: [String], default: [] })
  followUpQuestions!: string[];

  @Prop({ type: [String], default: [] })
  followUpAnswers!: string[];

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: String, default: null })
  responseId!: string | null;
}

export type WritingDeskJobDocument = WritingDeskJob & Document;

export const WritingDeskJobSchema = SchemaFactory.createForClass(WritingDeskJob);

WritingDeskJobSchema.index({ userId: 1 }, { unique: true });

WritingDeskJobSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString?.();
    delete ret._id;
    return ret;
  },
});

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SaveLetterDto, SavedLetterMetadataDto } from './dto/save-letter.dto';
import { UserSavedLetter } from './schemas/user-saved-letter.schema';

export type SavedLetterMetadata = SavedLetterMetadataDto;

export interface UserSavedLetterResource {
  id: string;
  responseId: string;
  letterHtml: string;
  tone: string;
  references: string[];
  metadata: SavedLetterMetadata;
  rawJson: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UserSavedLettersService {
  constructor(
    @InjectModel(UserSavedLetter.name) private readonly model: Model<UserSavedLetter>,
  ) {}

  async saveLetter(userId: string, input: SaveLetterDto): Promise<UserSavedLetterResource> {
    const references = Array.isArray(input.metadata.references)
      ? input.metadata.references.filter((ref) => typeof ref === 'string' && ref.trim().length > 0)
      : [];

    const document = await this.model
      .findOneAndUpdate(
        { user: userId, responseId: input.responseId },
        {
          $set: {
            letterHtml: input.letterHtml,
            metadata: {
              ...input.metadata,
              references,
              responseId: input.metadata.responseId ?? input.responseId,
            },
            tone: input.metadata.tone,
            references,
            rawJson: input.metadata.rawJson ?? null,
          },
          $setOnInsert: {
            user: userId,
            responseId: input.responseId,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return this.toResource(document);
  }

  async findByResponseIds(userId: string, responseIds: string[]): Promise<UserSavedLetterResource[]> {
    if (!Array.isArray(responseIds) || responseIds.length === 0) {
      return [];
    }
    const docs = await this.model
      .find({ user: userId, responseId: { $in: responseIds } })
      .lean()
      .exec();
    return docs.map((doc) => this.toResource(doc));
  }

  private toResource(doc: any): UserSavedLetterResource {
    const metadata = (doc?.metadata ?? {}) as SavedLetterMetadataDto;
    return {
      id: doc._id?.toString() ?? '',
      responseId: doc.responseId ?? metadata?.responseId ?? '',
      letterHtml: doc.letterHtml ?? '',
      tone: doc.tone ?? metadata?.tone ?? 'neutral',
      references: Array.isArray(doc.references) ? doc.references : [],
      metadata,
      rawJson: typeof doc.rawJson === 'string' ? doc.rawJson : (metadata?.rawJson ?? null),
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

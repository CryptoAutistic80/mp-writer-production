import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { SaveLetterDto, SavedLetterMetadataDto } from './dto/save-letter.dto';
import { UserSavedLetter } from './schemas/user-saved-letter.schema';
import { EncryptionService } from '../crypto/encryption.service';
import { ListSavedLettersDto } from './dto/list-saved-letters.dto';

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

export interface UserSavedLettersListResult {
  data: UserSavedLetterResource[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class UserSavedLettersService {
  constructor(
    @InjectModel(UserSavedLetter.name) private readonly model: Model<UserSavedLetter>,
    private readonly encryption: EncryptionService,
  ) {}

  async saveLetter(userId: string, input: SaveLetterDto): Promise<UserSavedLetterResource> {
    const references = Array.isArray(input.metadata.references)
      ? input.metadata.references.filter((ref) => typeof ref === 'string' && ref.trim().length > 0)
      : [];

    const metadata = {
      ...input.metadata,
      references,
      responseId: input.metadata.responseId ?? input.responseId,
    };

    const letterHtmlCiphertext = this.encryption.encryptObject(input.letterHtml);
    const metadataCiphertext = this.encryption.encryptObject(metadata);
    const referencesCiphertext = references.length > 0 ? this.encryption.encryptObject(references) : null;
    const rawJsonCiphertext = input.metadata.rawJson ? this.encryption.encryptObject(input.metadata.rawJson) : null;

    const document = await this.model
      .findOneAndUpdate(
        { user: userId, responseId: input.responseId },
        {
          $set: {
            letterHtmlCiphertext,
            metadataCiphertext,
            referencesCiphertext,
            rawJsonCiphertext,
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

  async findByDateRange(userId: string, options: ListSavedLettersDto): Promise<UserSavedLettersListResult> {
    const page = Math.max(1, Math.floor(options?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 20)));
    const skip = (page - 1) * pageSize;

    const query: FilterQuery<UserSavedLetter> = { user: userId };
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (options?.from) {
      createdAt.$gte = options.from;
    }
    if (options?.to) {
      createdAt.$lte = options.to;
    }
    if (createdAt.$gte || createdAt.$lte) {
      query.createdAt = createdAt as any;
    }

    const [documents, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return {
      data: documents.map((doc) => this.toResource(doc)),
      total,
      page,
      pageSize,
    };
  }

  private toResource(doc: any): UserSavedLetterResource {
    let letterHtml = '';
    let metadata: SavedLetterMetadataDto = { 
      mpName: '', 
      letterContent: '', 
      references: [], 
      tone: 'neutral', 
      rawJson: '' 
    };
    let references: string[] = [];
    let rawJson: string | null = null;

    try {
      if (doc.letterHtmlCiphertext) {
        letterHtml = this.encryption.decryptObject<string>(doc.letterHtmlCiphertext);
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.metadataCiphertext) {
        metadata = this.encryption.decryptObject<SavedLetterMetadataDto>(doc.metadataCiphertext);
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.referencesCiphertext) {
        const decrypted = this.encryption.decryptObject<string[]>(doc.referencesCiphertext);
        references = Array.isArray(decrypted) ? decrypted : [];
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.rawJsonCiphertext) {
        rawJson = this.encryption.decryptObject<string>(doc.rawJsonCiphertext);
      }
    } catch {
      // Decryption failed
    }

    return {
      id: doc._id?.toString() ?? '',
      responseId: doc.responseId ?? metadata?.responseId ?? '',
      letterHtml,
      tone: metadata?.tone ?? 'neutral',
      references,
      metadata,
      rawJson,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

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
    return Promise.all(docs.map((doc) => this.toResource(doc)));
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

    const data = await Promise.all(documents.map((doc) => this.toResource(doc)));

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  private async toResource(doc: any): Promise<UserSavedLetterResource> {
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

    const updates: Record<string, string | null> = {};

    try {
      if (doc.letterHtmlCiphertext) {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<string>(
          doc.letterHtmlCiphertext,
        );
        if (typeof payload === 'string') {
          letterHtml = payload;
        }
        if (rotated) {
          updates.letterHtmlCiphertext = ciphertext;
        }
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.metadataCiphertext) {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<SavedLetterMetadataDto>(
          doc.metadataCiphertext,
        );
        if (payload && typeof payload === 'object') {
          metadata = payload;
        }
        if (rotated) {
          updates.metadataCiphertext = ciphertext;
        }
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.referencesCiphertext) {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<string[]>(
          doc.referencesCiphertext,
        );
        if (Array.isArray(payload)) {
          references = payload.filter((value) => typeof value === 'string');
        }
        if (rotated) {
          updates.referencesCiphertext = ciphertext;
        }
      }
    } catch {
      // Decryption failed
    }

    try {
      if (doc.rawJsonCiphertext) {
        const { payload, ciphertext, rotated } = this.encryption.decryptObjectWithRotation<string>(
          doc.rawJsonCiphertext,
        );
        if (typeof payload === 'string') {
          rawJson = payload;
        }
        if (rotated) {
          updates.rawJsonCiphertext = ciphertext;
        }
      }
    } catch {
      // Decryption failed
    }

    if (doc._id && Object.keys(updates).length > 0) {
      await this.model.updateOne({ _id: doc._id }, { $set: updates }).exec();
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

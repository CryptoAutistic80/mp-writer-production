import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { WRITING_DESK_LETTER_TONES } from '../../writing-desk-jobs/writing-desk-jobs.types';
import { MaxUserInput, MaxAiContent, MaxHtmlContent, MaxJsonContent } from '../../common/decorators/content-validation.decorators';

export class SavedLetterMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  mpName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mpAddress1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  mpAddress2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mpCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mpCounty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  mpPostcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxUserInput()
  subjectLineHtml?: string;

  @IsString()
  @IsNotEmpty()
  @MaxAiContent()
  letterContent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderAddress1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderAddress2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderAddress3?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderCounty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  senderPostcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  senderTelephone?: string;

  @IsArray()
  @IsString({ each: true })
  references!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responseId?: string | null;

  @IsString()
  @IsIn(WRITING_DESK_LETTER_TONES)
  tone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxJsonContent()
  rawJson!: string;
}

export class SaveLetterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  responseId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxHtmlContent()
  letterHtml!: string;

  @ValidateNested()
  @Type(() => SavedLetterMetadataDto)
  metadata!: SavedLetterMetadataDto;
}

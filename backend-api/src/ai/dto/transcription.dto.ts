import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum TranscriptionModel {
  WHISPER_1 = 'whisper-1',
  GPT_4O_MINI_TRANSCRIBE = 'gpt-4o-mini-transcribe',
  GPT_4O_TRANSCRIBE = 'gpt-4o-transcribe',
}

export enum TranscriptionResponseFormat {
  JSON = 'json',
  TEXT = 'text',
  SRT = 'srt',
  VERBOSE_JSON = 'verbose_json',
  VTT = 'vtt',
}

export class TranscriptionDto {
  @IsString()
  audioData: string; // Base64 encoded audio data

  @IsOptional()
  @IsEnum(TranscriptionModel)
  model?: TranscriptionModel = TranscriptionModel.GPT_4O_MINI_TRANSCRIBE;

  @IsOptional()
  @IsEnum(TranscriptionResponseFormat)
  responseFormat?: TranscriptionResponseFormat = TranscriptionResponseFormat.TEXT;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class StreamingTranscriptionDto {
  @IsString()
  audioData: string; // Base64 encoded audio data

  @IsOptional()
  @IsEnum(TranscriptionModel)
  model?: TranscriptionModel = TranscriptionModel.GPT_4O_MINI_TRANSCRIBE;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

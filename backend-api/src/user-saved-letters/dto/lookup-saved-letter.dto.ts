import { IsArray, IsString } from 'class-validator';

export class LookupSavedLettersDto {
  @IsArray()
  @IsString({ each: true })
  responseIds!: string[];
}

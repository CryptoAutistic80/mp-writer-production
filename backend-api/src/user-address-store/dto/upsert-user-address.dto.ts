import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertUserAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  county?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  postcode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telephone?: string;
}


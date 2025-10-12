import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SaveLetterDto } from './dto/save-letter.dto';
import { UserSavedLettersService } from './user-saved-letters.service';
import { LookupSavedLettersDto } from './dto/lookup-saved-letter.dto';

@UseGuards(JwtAuthGuard)
@Controller('user/saved-letters')
export class UserSavedLettersController {
  constructor(private readonly savedLetters: UserSavedLettersService) {}

  @Post()
  async saveLetter(@Req() req: any, @Body() body: SaveLetterDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    if (!userId) {
      throw new BadRequestException('User account required');
    }
    return this.savedLetters.saveLetter(userId, body);
  }

  @Post('lookup')
  async lookupSavedLetters(@Req() req: any, @Body() body: LookupSavedLettersDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    if (!userId) {
      throw new BadRequestException('User account required');
    }
    const responseIds = Array.isArray(body?.responseIds) ? body.responseIds : [];
    return this.savedLetters.findByResponseIds(
      userId,
      responseIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    );
  }
}

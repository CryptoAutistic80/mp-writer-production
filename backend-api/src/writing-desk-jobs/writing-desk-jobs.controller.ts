import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { UpsertActiveWritingDeskJobDto } from './dto/upsert-active-writing-desk-job.dto';

@UseGuards(JwtAuthGuard)
@Controller('writing-desk/jobs/active')
export class WritingDeskJobsController {
  constructor(private readonly jobs: WritingDeskJobsService) {}

  @Get()
  async getActiveJob(@Req() req: any) {
    return this.jobs.getActiveJobForUser(req.user.id);
  }

  @Put()
  async upsertActiveJob(@Req() req: any, @Body() body: UpsertActiveWritingDeskJobDto) {
    return this.jobs.upsertActiveJob(req.user.id, body);
  }

  @Delete()
  async deleteActiveJob(@Req() req: any) {
    await this.jobs.deleteActiveJob(req.user.id);
    return { success: true };
  }
}

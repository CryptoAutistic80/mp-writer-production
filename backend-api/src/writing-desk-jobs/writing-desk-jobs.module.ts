import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WritingDeskJobsController } from './writing-desk-jobs.controller';
import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { WritingDeskJobsRepository } from './writing-desk-jobs.repository';
import { WritingDeskJob, WritingDeskJobSchema } from './schema/writing-desk-job.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: WritingDeskJob.name, schema: WritingDeskJobSchema }])],
  controllers: [WritingDeskJobsController],
  providers: [WritingDeskJobsService, WritingDeskJobsRepository],
  exports: [WritingDeskJobsService],
})
export class WritingDeskJobsModule {}

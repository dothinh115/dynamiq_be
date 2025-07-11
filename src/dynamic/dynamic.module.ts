import { Module } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { DynamicController } from './dynamic.controller';

@Module({
  imports: [],
  controllers: [DynamicController],
  providers: [DynamicService],
})
export class DynamicModule {}

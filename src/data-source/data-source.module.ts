import { DataSourceService } from '../data-source/data-source.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [DataSourceService],
  exports: [DataSourceService],
})
export class DataSourceModule {}

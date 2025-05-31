import * as path from 'path';
import { CommonService } from '../common/common.service';
import { createDataSource } from '../data-source/data-source';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AutoGenerateService } from '../auto-generate/auto-generate.service';

@Injectable()
export class DataSourceService implements OnModuleInit {
  private dataSource: DataSource;
  private logger = new Logger(DataSourceService.name);

  constructor(
    private commonService: CommonService,
    private autoGService: AutoGenerateService,
  ) {}

  async onModuleInit() {
    this.logger.log('Chuẩn bị gán và init DataSource.');
    const dynamicEntityDir = path.resolve(__dirname, '..', 'dynamic-entities');
    const entityDir = path.resolve(__dirname, '..', 'entities');
    const entities = [
      ...(await this.commonService.loadDynamicEntities(dynamicEntityDir)),
      ...(await this.commonService.loadDynamicEntities(entityDir)),
    ];
    this.dataSource = createDataSource(entities);
    await this.dataSource.initialize();
    this.logger.debug('Gán và init DataSource thành công!');
  }

  async reloadDataSource() {
    if (!this.dataSource.isInitialized) {
      this.logger.debug('DataSource chưa init, bỏ qua reload!');
      return;
    }

    this.logger.log('🔁 Chuẩn bị reload DataSource');
    await this.dataSource.destroy();
    this.logger.debug('✅ Destroy DataSource cũ thành công!');

    try {
      const dynamicEntityDir = path.resolve(
        __dirname,
        '..',
        'dynamic-entities',
      );

      const entities =
        await this.commonService.loadDynamicEntities(dynamicEntityDir);

      this.dataSource = createDataSource(entities);
      await this.dataSource.initialize();
      this.logger.debug('✅ ReInit DataSource thành công!');
    } catch (err: any) {
      this.logger.error('❌ Lỗi khi reInit DataSource:', err.message);
      this.logger.error(err.stack || err);
    }
  }

  getRepository<Entity>(tableName: string): Repository<Entity> {
    if (!this.dataSource.isInitialized) {
      throw new Error('DataSource chưa được khởi tạo!');
    }

    const metadata = this.dataSource.entityMetadatas.find(
      (meta) => meta.tableName === tableName,
    );

    if (!metadata) {
      throw new Error(
        `Không tìm thấy entity tương ứng với bảng "${tableName}"`,
      );
    }

    return this.dataSource.getRepository<Entity>(metadata.target as any);
  }

  getDataSource() {
    return this.dataSource;
  }
}

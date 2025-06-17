import * as path from 'path';
import { CommonService } from '../common/common.service';
import { createDataSource } from '../data-source/data-source';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntitySchema, EntityTarget, Repository } from 'typeorm';

const entityDir = path.resolve('dist', 'entities');

@Injectable()
export class DataSourceService implements OnModuleInit {
  private dataSource: DataSource;
  private logger = new Logger(DataSourceService.name);

  constructor(private commonService: CommonService) {}

  async onModuleInit() {
    this.logger.log('Chuẩn bị gán và init DataSource.');

    await this.reloadDataSource();
    this.logger.debug('Gán và init DataSource thành công!');
  }

  async reloadDataSource() {
    this.logger.log('🔁 Chuẩn bị reload DataSource');
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      this.clearMetadata();
    }
    this.logger.debug('✅ Destroy DataSource cũ thành công!');

    try {
      const entities = await this.commonService.loadDynamicEntities(entityDir);
      console.log(entities);
      this.dataSource = createDataSource(entities);
      await this.dataSource.initialize();
      this.logger.debug('✅ ReInit DataSource thành công!');
      return this.dataSource;
    } catch (error: any) {
      this.logger.error('❌ Lỗi khi reInit DataSource:', error.message);
      this.logger.error(error.stack || error);
      throw error;
    }
  }

  getRepository<Entity>(
    identifier: string | Function | EntitySchema<any>,
  ): Repository<Entity> | null {
    if (!this.dataSource?.isInitialized) {
      throw new Error('DataSource chưa được khởi tạo!');
    }

    let metadata;

    if (typeof identifier === 'string') {
      // Tìm theo tên bảng
      metadata = this.dataSource.entityMetadatas.find(
        (meta) => meta.tableName === identifier,
      );
    } else {
      try {
        metadata = this.dataSource.getMetadata(identifier);
      } catch {
        return null; // Không tìm thấy metadata
      }
    }

    if (!metadata) {
      return null;
    }

    return this.dataSource.getRepository<Entity>(metadata.target as any);
  }

  getDataSource() {
    return this.dataSource;
  }

  getEntityClassByTableName(tableName: string): Function | undefined {
    const entityMetadata = this.dataSource.entityMetadatas.find(
      (meta) =>
        meta.tableName === tableName || meta.givenTableName === tableName,
    );

    return entityMetadata?.target as Function | undefined;
  }

  getTableNameFromEntity(entity: EntityTarget<any>): string {
    const metadata = this.dataSource.getMetadata(entity);
    return metadata.tableName;
  }

  clearMetadata() {
    (this.dataSource as any).entityMetadatas = [];
    (this.dataSource as any).entityMetadatasMap = new Map();
    (this.dataSource as any).repositories = [];
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { TableHanlderService } from '../table/table.service';
import { Table_definition } from '../entities/table_definition.entity';
import { AutoService } from '../auto/auto-entity.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import { Route_definition } from '../entities/route_definition.entity';
import { Role_definition } from '../entities/role_definition.entity';
import { Setting_definition } from '../entities/setting_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { Column_definition } from '../entities/column_definition.entity';
import { Relation_definition } from '../entities/relation_definition.entity';
const initJson = require('./init.json');

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHanlderService,
    private autoService: AutoService,
    private commonService: CommonService,
    @InjectRepository(Table_definition)
    private tableDefRepo: Repository<Table_definition>,
  ) {}

  private async waitForDatabaseConnection(
    maxRetries = 10,
    delayMs = 1000,
  ): Promise<void> {
    const dataSource = this.dataSourceService.getDataSource();

    for (let i = 0; i < maxRetries; i++) {
      try {
        await dataSource.query('SELECT 1');
        this.logger.log('Kết nối tới DB thành công.');
        return;
      } catch (error) {
        this.logger.warn(`Chưa kết nối được DB, thử lại sau ${delayMs}ms...`);
        await this.commonService.delay(delayMs);
      }
    }

    throw new Error(`Không thể kết nối tới DB sau ${maxRetries} lần thử.`);
  }

  async onApplicationBootstrap() {
    await this.waitForDatabaseConnection();

    await this.createInitMetadata();
    await this.commonService.delay(300);

    await this.autoService.pullMetadataFromDb();
    await this.commonService.delay(300);

    await Promise.all([
      this.createDefaultRole(),
      this.insertDefaultSettingIfEmpty(),
      this.insertDefaultUserIfEmpty(),
      this.insertDefaultRoutes(),
    ]);
  }

  private async insertDefaultSettingIfEmpty(): Promise<void> {
    const tableName =
      this.commonService.getTableNameFromEntity(Setting_definition);
    const dataSource = this.dataSourceService.getDataSource();

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\``,
    );

    if (Number(count) === 0) {
      this.logger.log(
        `Bảng '${tableName}' chưa có dữ liệu, tiến hành tạo mặc định.`,
      );

      const repo = this.dataSourceService.getRepository(tableName);
      const setting = repo.create(initJson.defaultSetting);
      await repo.save(setting);

      this.logger.log(`Tạo setting mặc định thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã có dữ liệu.`);
    }
  }

  private async createDefaultRole(): Promise<void> {
    const tableName =
      this.commonService.getTableNameFromEntity(Role_definition);
    const dataSource = this.dataSourceService.getDataSource();

    const [result] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\` WHERE name = ?`,
      [initJson.defaultRole.name],
    );

    const existsInDb = result.count > 0;

    if (!existsInDb) {
      this.logger.log(`Tạo vai trò mặc định: ${initJson.defaultRole.name}`);
      const repo = this.dataSourceService.getRepository(tableName);
      const role = repo.create(initJson.defaultRole);
      await repo.save(role);
      this.logger.log(`Vai trò mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `Vai trò mặc định '${initJson.defaultRole.name}' đã tồn tại.`,
      );
    }
  }

  private async insertDefaultUserIfEmpty(): Promise<void> {
    const tableName =
      this.commonService.getTableNameFromEntity(User_definition);
    const dataSource = this.dataSourceService.getDataSource();
    const userRepo = this.dataSourceService.getRepository(tableName);

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\``,
    );

    if (Number(count) === 0) {
      this.logger.log(`Tạo user mặc định: ${initJson.defaultUser.email}`);

      const user = userRepo.create(initJson.defaultUser);

      await userRepo.save(user);
      this.logger.log(`User mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `User mặc định '${initJson.defaultUser.email}' đã tồn tại.`,
      );
    }
  }

  private async insertDefaultRoutes(): Promise<void> {
    const routeRepo = this.dataSourceService.getRepository(Route_definition);
    const tableDefRepo = this.dataSourceService.getRepository(Table_definition);

    const existingRoutes = await routeRepo.find();

    const paths = [
      this.commonService.getTableNameFromEntity(User_definition),
      this.commonService.getTableNameFromEntity(Role_definition),
      this.commonService.getTableNameFromEntity(Setting_definition),
    ];

    let insertedCount = 0;

    for (const path of paths) {
      // 🔍 Tìm id trong TableDefinition theo name
      const targetTable: any = await tableDefRepo.findOne({
        where: { name: path },
      });

      if (!targetTable) {
        this.logger.warn(
          `❗Không tìm thấy TableDefinition cho '${path}', bỏ qua.`,
        );
        continue;
      }

      for (const method of Object.keys(initJson.routeDefinition)) {
        const def = initJson.routeDefinition[method];

        const alreadyExists = existingRoutes.some(
          (r: any) => r.method === def.method && r.path === `/${path}`,
        );

        if (!alreadyExists) {
          const route = routeRepo.create({
            method: def.method,
            path: `/${path}`,
            handler: def.handler,
            targetTable: targetTable.id, // 👈 Gán ID vào đây
          });

          await routeRepo.save(route);
          insertedCount++;
        }
      }
    }

    if (insertedCount) {
      this.logger.log(`✅ Đã tạo ${insertedCount} route mặc định.`);
    } else {
      this.logger.debug(`Tất cả route mặc định đã tồn tại.`);
    }
  }
  async saveToDb(payload: CreateTableDto, repo: Repository<any>) {
    const newPayload = {
      ...payload,
      relations: this.tableHandlerService.prepareRelations(payload.relations),
    };
    try {
      return await repo.save(newPayload);
    } catch (error) {}
  }

  async createInitMetadata() {
    const snapshot = await import(path.resolve('snapshot.json'));
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tableNameToId: Record<string, number> = {};

      // Phase 1: Insert bảng trắng
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;

        const exist = await queryRunner.manager.findOne(
          this.tableDefRepo.target,
          {
            where: { name: def.name },
          },
        );

        if (exist) {
          tableNameToId[name] = exist.id;
          this.logger.log(`⏩ Bỏ qua ${name}, đã tồn tại`);
        } else {
          const { columns, relations, ...rest } = def; // Bỏ columns và relations, giữ các thuộc tính khác
          const created = await queryRunner.manager.save(
            this.tableDefRepo.target,
            {
              ...rest,
              isStatic: true,
            },
          );
          tableNameToId[name] = created.id;
          this.logger.log(`✅ Tạo bảng trắng: ${name}`);
        }
      }

      // Phase 2: Insert tất cả columns
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        const columns = (def.columns || []).map((col: any) => ({
          ...col,
          table: { id: tableId },
        }));

        await queryRunner.manager.delete(Column_definition, {
          table: { id: tableId },
        });

        if (columns.length) {
          await queryRunner.manager.save(Column_definition, columns);
        }

        this.logger.log(`📌 Ghi columns cho ${name}`);
      }

      // Phase 3: Insert tất cả relations
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        const relations = (def.relations || [])
          .map((rel: any) => {
            const targetId = tableNameToId[rel.targetTable];
            if (!targetId) {
              this.logger.warn(
                `⚠️ Không resolve được targetTable: ${rel.targetTable} trong relation của ${name}`,
              );
              return null;
            }

            return {
              ...rel,
              sourceTable: { id: tableId },
              targetTable: { id: targetId },
            };
          })
          .filter(Boolean);

        await queryRunner.manager.delete(Relation_definition, {
          sourceTable: { id: tableId },
        });

        if (relations.length) {
          await queryRunner.manager.save(Relation_definition, relations);
        }

        this.logger.log(`📌 Ghi relations cho ${name}`);
      }

      await queryRunner.commitTransaction();
      this.logger.log('🎉 createInitMetadata hoàn tất!');
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('💥 Lỗi khi chạy createInitMetadata:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

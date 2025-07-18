import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Brackets } from 'typeorm';
import { parseSortInput } from './utils/parse-sort-input';
import { walkFilter } from './utils/walk-filter';
import { buildJoinTree } from './utils/build-join-tree';

@Injectable()
export class QueryEngine {
  private log: string[] = [];

  constructor(private dataSourceService: DataSourceService) {}

  async find(options: {
    tableName: string;
    fields?: string | string[];
    filter?: any;
    sort?: string | string[];
    page?: number;
    limit?: number;
    meta?: string;
    aggregate?: any;
  }): Promise<any> {
    try {
      const { tableName, fields, filter, sort, page, limit, meta } = options;
      const dataSource = this.dataSourceService.getDataSource();
      const metaData = dataSource.getMetadata(tableName);

      this.log = [];
      const parsedSort = parseSortInput(sort);

      const { joinArr, selectArr, sortArr } = buildJoinTree({
        meta: metaData,
        fields,
        filter,
        sort: parsedSort.map((parsed) => parsed.field),
        rootAlias: tableName,
        dataSource,
      });

      const { parts } = walkFilter({
        filter,
        currentMeta: metaData,
        currentAlias: tableName,
      });

      const qb = dataSource.createQueryBuilder(metaData.target, tableName);

      for (const join of joinArr) {
        qb.leftJoinAndSelect(
          `${join.parentAlias}.${join.propertyPath}`,
          join.alias,
        );
      }

      qb.select([...selectArr]);

      if (parts.length > 0) {
        qb.where(
          new Brackets((qb2) => {
            for (const p of parts) {
              if (p.operator === 'AND') {
                qb2.andWhere(p.sql, p.params);
              } else {
                qb2.orWhere(p.sql, p.params);
              }
            }
          }),
        );
      }

      for (const sort of sortArr) {
        qb.addOrderBy(
          `${sort.alias}.${sort.field}`,
          parsedSort.find((parsed) => parsed.field === sort.field)?.direction ??
            'ASC',
        );
      }

      // === Xử lý meta ===
      const metaParts = (meta || '').split(',').map((x) => x.trim());
      let totalCount = 0;
      let filterCount = 0;

      // totalCount = full table
      if (metaParts.includes('totalCount') || metaParts.includes('*')) {
        totalCount = await dataSource
          .createQueryBuilder(metaData.target, tableName)
          .getCount();
        this.log.push(`+ totalCount = ${totalCount}`);
      }

      // filterCount = sau filter
      if (metaParts.includes('filterCount') || metaParts.includes('*')) {
        const filterQb = dataSource.createQueryBuilder(
          metaData.target,
          tableName,
        );

        if (parts.length > 0) {
          for (const join of joinArr) {
            filterQb.leftJoin(
              `${join.parentAlias}.${join.propertyPath}`,
              join.alias,
            );
          }

          filterQb.where(
            new Brackets((qb2) => {
              for (const p of parts) {
                if (p.operator === 'AND') {
                  qb2.andWhere(p.sql, p.params);
                } else {
                  qb2.orWhere(p.sql, p.params);
                }
              }
            }),
          );
        }

        filterCount = await filterQb.getCount();
        this.log.push(`+ filterCount = ${filterCount}`);
      }

      // === paging ===
      if (limit) qb.take(limit);
      if (page && limit) qb.skip((page - 1) * limit);

      const rows = await qb.getMany();
      // const rows = this.groupRawResultRecursive(
      //   rawRows,
      //   tableName,
      //   metaData,
      //   joinArr,
      // );

      return {
        data: rows,
        ...(meta && {
          meta: {
            totalCount,
            filterCount,
          },
        }),
        // debug: {
        //   sql: qb.getSql(),
        //   select: selectArr,
        //   join: joinArr,
        //   log: this.log,
        // },
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}

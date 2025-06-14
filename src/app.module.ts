import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DynamicModule } from './dynamic/dynamic.module';
import { TableModule } from './table/table.module';
import * as path from 'path';
import { RabbitMQRegistry } from './rabbitmq/rabbitmq.service';
import { DataSourceModule } from './data-source/data-source.module';
import { CommonModule } from './common/common.module';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { AutoGenerateModule } from './auto/auto.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { HideFieldInterceptor } from './interceptors/hidden-field.interceptor';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';
import { AuthModule } from './auth/auth.module';
import { RoleGuard } from './guard/role.guard';
import { MeModule } from './me/me.module';
import { RouteDetectMiddleware } from './middleware/route-detect.middleware';
import { DynamicMiddleware } from './middleware/dynamic.middleware';
import { NotFoundDetectGuard } from './guard/not-found-detect.guard';
import { SchemaReloadService } from './schema/schema-reload.service';
import { RedisPubSubService } from './redis-pubsub/redis-pubsub.service';
import { SchemaStateService } from './schema/schema-state.service';
import { SchemaLockGuard } from './guard/schema-lock.guard';
import { SqlFunctionService } from './sql/sql-function.service';
import { QueryBuilderModule } from './query-builder/query-builder.module';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { SystemRecordProtectGuard } from './guard/system-record-protect.guard';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env'),
    }),
    TableModule,
    DatabaseModule,
    CommonModule,
    DataSourceModule,
    AutoGenerateModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get('SECRET_KEY'),
        };
      },
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        url: configService.get('REDIS_URI'),
        ttl: configService.get('DEFAULT_TTL'),
      }),
      inject: [ConfigService],
    }),
    QueryBuilderModule,
    AuthModule,
    MeModule,
    DynamicModule,
  ],
  providers: [
    BootstrapService,
    RabbitMQRegistry,
    JwtStrategy,
    HideFieldInterceptor,
    SchemaStateService,
    SchemaReloadService,
    RedisPubSubService,
    SqlFunctionService,
    { provide: APP_GUARD, useClass: SchemaLockGuard },
    { provide: APP_GUARD, useClass: NotFoundDetectGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_GUARD, useClass: SystemRecordProtectGuard },
    { provide: APP_INTERCEPTOR, useClass: HideFieldInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
  exports: [
    RabbitMQRegistry,
    DataSourceModule,
    JwtModule,
    SchemaReloadService,
    SchemaStateService,
    RedisPubSubService,
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly redisPubSubService: RedisPubSubService) {}

  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(RouteDetectMiddleware).forRoutes('*');
    consumer.apply(DynamicMiddleware).forRoutes('*');
  }
}

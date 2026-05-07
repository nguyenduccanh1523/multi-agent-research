import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

function getRequiredEnv(configService: ConfigService, key: string): string {
  const value = configService.get<string>(key);

  if (value === undefined || value === null || value === '') {
    throw new Error(`${key} is missing in .env`);
  }

  return String(value);
}

function getOptionalEnv(
  configService: ConfigService,
  key: string,
  defaultValue: string,
): string {
  const value = configService.get<string>(key);

  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value);
}

export function databaseConfig(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const host = getRequiredEnv(configService, 'DB_HOST');
  const port = Number(getOptionalEnv(configService, 'DB_PORT', '5432'));
  const username = getRequiredEnv(configService, 'DB_USERNAME');
  const password = getRequiredEnv(configService, 'DB_PASSWORD');
  const database = getRequiredEnv(configService, 'DB_DATABASE');

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,

    autoLoadEntities: true,
    synchronize: false,
    logging: false,

    extra: {
      max: 10,
    },
  };
}

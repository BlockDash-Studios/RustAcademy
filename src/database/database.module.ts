import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>("NODE_ENV") === "production";

        const host = config.get<string>("DB_HOST");
        const port = config.get<string>("DB_PORT");
        const username = config.get<string>("DB_USERNAME");
        const password = config.get<string>("DB_PASSWORD");
        const database = config.get<string>("DB_NAME");

        const missing = Object.entries({
          DB_HOST: host,
          DB_PORT: port,
          DB_USERNAME: username,
          DB_PASSWORD: password,
          DB_NAME: database,
        })
          .filter(([, value]) => !value)
          .map(([key]) => key);

        if (missing.length > 0) {
          // Fail loudly at startup rather than letting repositories
          // silently misbehave later.
          throw new Error(
            `Missing required database configuration: ${missing.join(", ")}`,
          );
        }

        return {
          type: "postgres",
          host,
          port: Number(port),
          username,
          password,
          database,
          autoLoadEntities: true,
          // Never auto-sync in production; migrations should own schema changes.
          synchronize: !isProd,
          ssl: isProd ? { rejectUnauthorized: false } : false,
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

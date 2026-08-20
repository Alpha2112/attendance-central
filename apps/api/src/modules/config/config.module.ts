import { Module, Global } from '@nestjs/common';
import { loadAppConfig, type AppConfig } from '@attendance/config';

export const CONFIG_TOKEN = 'APP_CONFIG';

@Global()
@Module({
  providers: [
    {
      provide: CONFIG_TOKEN,
      useFactory: (): AppConfig => {
        return loadAppConfig();
      },
    },
  ],
  exports: [CONFIG_TOKEN],
})
export class ConfigModule {}

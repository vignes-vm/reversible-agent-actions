import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { TxnModule } from './txn/txn.module.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'reversible-agent-actions',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'root',
  description: 'Reversible Agent Actions MCP Server',
  imports: [
    ConfigModule.forRoot(),
    TxnModule,
  ],
})
export class AppModule {}

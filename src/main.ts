import 'dotenv/config';
import { McpApp, McpApplicationFactory, DIContainer, defaultLogger, triggerLifecycleHook } from '@nitrostack/core';
import type { NitroStackServer } from '@nitrostack/core';
import { AppModule } from './app.module.js';
import { RollbackOrchestrator } from './txn/services/rollback.service.js';
import type { ToolExecutor } from './txn/services/rollback.service.js';
import { JournalInterceptor } from './txn/interceptors/journal.interceptor.js';
import { JournalCapturePipe } from './txn/pipes/journal-capture.pipe.js';
import { TransactionContext } from './txn/services/transaction-context.service.js';

// McpApplicationFactory reads @Module metadata from whatever class `module`
// points to (AppModule) — the class @McpApp itself decorates doesn't need its
// own @Module metadata.
@McpApp({
  module: AppModule,
  server: { name: 'reversible-actions', version: '1.0.0' },
})
export class Application {}

/**
 * Builds the ToolExecutor shared by RollbackOrchestrator (compensator calls),
 * JournalCapturePipe (pre-reads), and JournalInterceptor (post-execution
 * version re-reads) — the bridge from "call this tool by name" back into the
 * same running server's tool registry.
 *
 * Compensator/pre-read/post-read calls made through here must NOT themselves
 * be journaled as new forward steps: the inverse tools (delete_account, etc.)
 * carry the same @UseInterceptors(JournalInterceptor) as their forward
 * counterparts, so without this guard, compensating a step during rollback
 * would append another step to the same transaction's journal. Clearing the
 * shared TransactionContext for the duration of the call makes
 * JournalInterceptor take its "not in a transaction" pass-through path.
 */
function createToolExecutor(server: NitroStackServer, txnCtx: TransactionContext): ToolExecutor {
  return async (toolName, args) => {
    // `tools` is typed private on NitroStackServer (no public lookup-by-name
    // API exists), but is a plain enumerable property at runtime.
    const tool = (
      server as unknown as { tools: Map<string, { execute: (input: unknown, context: unknown) => Promise<unknown> }> }
    ).tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const savedActiveId = txnCtx.activeId;
    const savedActiveScope = txnCtx.activeScope;
    txnCtx.clear();
    try {
      return await tool.execute(args, {
        requestId: `internal-${toolName}`,
        toolName,
        logger: defaultLogger,
        metadata: {},
      });
    } finally {
      if (savedActiveId) txnCtx.setActive(savedActiveId, savedActiveScope);
    }
  };
}

async function bootstrap() {
  // There is no exported bootstrap() helper in @nitrostack/core — the real
  // entry point is McpApplicationFactory.create(...).start().
  const app = await McpApplicationFactory.create(Application);

  // McpApplicationFactory.create() never calls triggerLifecycleHook itself, so
  // OnModuleInit hooks (CrmTools/MessagingTools/BillingTools registering
  // themselves with CompensatorRegistry) must be fired explicitly, after all
  // controllers have been resolved into the DI container but before the
  // server starts accepting calls.
  await triggerLifecycleHook(DIContainer.getInstance().getInstances(), 'onModuleInit');

  const container = DIContainer.getInstance();
  const txnCtx = container.resolve(TransactionContext);
  const toolExecutor = createToolExecutor(app, txnCtx);
  container.resolve(RollbackOrchestrator).setToolExecutor(toolExecutor);
  container.resolve(JournalInterceptor).setToolExecutor(toolExecutor);
  container.resolve(JournalCapturePipe).setToolExecutor(toolExecutor);

  await app.start();
}

bootstrap();

import { Injectable, createAPIKeyAuth } from '@nitrostack/core';
import type { NitroStackServer } from '@nitrostack/core';

/**
 * Gates the MCP HTTP transport (the deployed NitroCloud endpoint) behind
 * API_KEY. This is the real security boundary — see the comment above
 * TransactionTools for why per-tool @UseGuards on ExecutionContext.metadata
 * cannot work against any real MCP client.
 *
 * Must run via onApplicationBootstrap, not after NitroStackServer.start()
 * resolves: NitroStackServer creates the Express app early in start() but
 * only calls httpTransport.start() (which registers the /mcp routes) near
 * the very end, after onApplicationBootstrap fires for all DI instances —
 * exactly the window OAuthModule itself relies on to mount its own auth
 * middleware "before routes are compiled". Attaching middleware any later
 * would register it after the /mcp route handlers, so Express would never
 * reach it.
 */
@Injectable()
export class ApiKeyGateService {
  private server?: NitroStackServer;

  setServer(server: NitroStackServer): void {
    this.server = server;
  }

  onApplicationBootstrap(): void {
    const apiKey = process.env.API_KEY;
    if (!apiKey || !this.server) return;
    const app = this.server.getHttpTransport()?.getApp?.();
    if (!app) return;
    app.use(
      '/mcp',
      createAPIKeyAuth({
        keys: [apiKey],
        headerName: 'X-API-Key',
      })
    );
  }
}

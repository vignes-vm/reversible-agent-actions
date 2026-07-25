import { Injectable } from '@nitrostack/core';
import type { ExecutionContext, Guard } from '@nitrostack/core';
import { TxnError } from '../services/txn-error.js';

/**
 * Requires the request to have already been authenticated by the API key
 * middleware (wired at bootstrap via ApiKeyModule.forRoot(...)), which populates
 * context.auth. This guard only checks that authentication happened — it does
 * not itself validate keys.
 */
@Injectable()
export class ApiKeyGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    if (!context.auth?.subject) {
      throw new TxnError('UNAUTHENTICATED', 'Missing or invalid API key');
    }
    return true;
  }
}

import { Injectable } from '@nitrostack/core';
import type { ExecutionContext, Guard } from '@nitrostack/core';
import { TxnError } from '../services/txn-error.js';

/**
 * Authorizes the destructive rollback_transaction tool: the caller must be
 * authenticated and, if scopes are enforced, must hold 'txn:rollback' (or the
 * blanket 'txn:*'). Guards only receive ExecutionContext (not tool input), so
 * this cannot check the specific transaction's state — that check happens in
 * RollbackOrchestrator.run, which is idempotent and safe to call regardless.
 */
@Injectable()
export class RollbackGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    if (!context.auth?.subject) {
      throw new TxnError('UNAUTHENTICATED', 'Missing or invalid API key');
    }
    const scopes = context.auth.scopes;
    if (scopes && scopes.length > 0 && !scopes.includes('txn:rollback') && !scopes.includes('txn:*')) {
      throw new TxnError('FORBIDDEN', "Caller lacks the 'txn:rollback' scope required to reverse a transaction");
    }
    return true;
  }
}

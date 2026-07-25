import { Injectable, Interceptor } from '@nitrostack/core';
import type { ExecutionContext, InterceptorInterface } from '@nitrostack/core';
import type { CapturedState, StepStatus } from '../types.js';
import { JournalService } from '../services/journal.service.js';
import { CompensatorRegistry } from '../services/registry.service.js';
import { ReversibilityClassifier } from '../services/classifier.service.js';
import { TransactionContext } from '../services/transaction-context.service.js';
import { TxnError } from '../services/txn-error.js';

/**
 * @nitrostack/core's public ExecutionContext type does not declare `input`, `invoke`,
 * or `emit` (its own JSDoc examples use `ctx.emit(...)` regardless), but the framework
 * attaches them at runtime for tool executions. This local extension documents the
 * shape this interceptor actually relies on.
 */
interface ToolExecutionContext extends ExecutionContext {
  input: unknown;
  invoke(toolName: string, input: unknown): Promise<any>;
  emit(event: string, payload: unknown): void;
}

/**
 * Wraps every tool call executed inside a transaction with journaling: captures
 * prior state via pre-read before execution, classifies reversibility, and appends
 * an immutable step record — even when the wrapped call fails.
 */
@Injectable({ deps: [JournalService, CompensatorRegistry, ReversibilityClassifier, TransactionContext] })
@Interceptor()
export class JournalInterceptor implements InterceptorInterface {
  constructor(
    private readonly journal: JournalService,
    private readonly registry: CompensatorRegistry,
    private readonly classifier: ReversibilityClassifier,
    private readonly txnCtx: TransactionContext
  ) {}

  async intercept(context: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    const ctx = context as ToolExecutionContext;

    // INVARIANT 8: not in a transaction — pass through unchanged.
    const txnId = this.txnCtx.activeId;
    if (!txnId) return next();

    const spec = this.registry.lookup(ctx.toolName ?? '');

    // SCOPE CHECK
    if (!this.txnCtx.scopeAllows(spec?.server)) {
      throw new TxnError(
        'SCOPE_VIOLATION',
        `Tool ${ctx.toolName} (server: ${spec?.server}) is outside transaction scope`
      );
    }

    // PRE-READ (THE MOST FORGOTTEN STEP) — must happen before execution, or
    // RESTORATIVE steps have no prior value to classify or roll back against.
    const captured: CapturedState = { value: null, ref: null, version: null };
    if (spec?.requiresPreRead && spec.preReadTool && spec.preReadArgs) {
      try {
        const preReadInput = spec.preReadArgs(ctx.input);
        const snap: any = await ctx.invoke(spec.preReadTool, preReadInput);
        captured.value = snap?.value ?? snap;
        captured.ref = snap?.ref ?? null;
        captured.version = snap?.version ?? snap?.updatedAt ?? null;
      } catch (err) {
        ctx.logger.warn('Pre-read failed — step will classify as TERMINAL', {
          tool: ctx.toolName,
          error: String(err),
        });
        // do NOT throw — continue without captured state. The classifier handles it.
      }
    }

    // EXECUTE
    let output: unknown;
    let stepStatus: StepStatus = 'EXECUTED';
    try {
      output = await next();
    } catch (err) {
      stepStatus = 'FAILED';
      output = { error: String(err) };
    }

    // CLASSIFY
    const reversibility = this.classifier.classify({ spec, prior: captured.value, at: new Date() });

    // APPEND (always — even on failure — INVARIANT 2)
    const seq = this.journal.nextSeq(txnId);
    this.journal.append({
      txnId,
      seq,
      server: spec?.server ?? 'unknown',
      toolName: ctx.toolName ?? '',
      input: ctx.input,
      output,
      priorState: captured.value,
      resourceRef: captured.ref,
      resourceVersion: captured.version,
      reversibility,
      status: stepStatus,
      compensationNote: null,
    });

    // PIVOT UPDATE (INVARIANT 5)
    if (reversibility === 'TERMINAL') {
      this.journal.markPivotIfUnset(txnId, seq);
    }

    // EMIT
    ctx.emit('txn.step.recorded', { txnId, seq, tool: ctx.toolName, class: reversibility, status: stepStatus });

    if (stepStatus === 'FAILED') {
      throw new Error((output as { error: string }).error);
    }
    return output;
  }
}

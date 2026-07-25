# Reversible Agent Actions (Transactional MCP Framework)

A Saga Transaction Engine for AI Agents built on **NitroStack**, providing action risk taxonomy classification, append-only step journaling, LIFO saga rollbacks, interactive timeline UI widgets, and domain target tools.

## Architecture & Features

### 1. Action Taxonomy (§3.4)
- **`READ_ONLY`**: Zero side-effects (e.g. `crm_get_lead`, `billing_get_balance`).
- **`COMPENSATABLE`**: Reversible side-effects with inverse compensating tools (e.g. `crm_create_lead` $\rightarrow$ `crm_delete_lead`, `billing_hold_funds` $\rightarrow$ `billing_release_hold`).
- **`PIVOT`**: Irreversible actions (e.g. `messaging_send_email`, `billing_charge_card`).

### 2. Core Transaction Tools (§7.1)
- `txn_begin`: Initialize a new saga transaction context.
- `txn_commit`: Finalize active transaction.
- `txn_rollback`: Manually trigger LIFO unwinding of compensatable steps.
- `txn_status`: Query timeline & render interactive React UI widget.
- `txn_explain`: Dry-run pre-execution planning analysis.

### 3. Resources & Prompts (§7.2, §7.3)
- `txn://registry/compensators`: View registered compensator rules.
- `txn://journal/{txnId}`: Inspect append-only journal logs.
- `txn://active`: List active transactions.
- `safe_multi_step_plan`: System prompt template guiding safe action sequencing.

### 4. Interactive Timeline Widget (§12)
React widget rendering step cards, classification badges, and a live rollback trigger.

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run seed demo
npx tsx fixtures/seed.ts
```

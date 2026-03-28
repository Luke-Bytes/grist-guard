# Grist Broker Workflow

- Use only `grist-guard` tools for Grist access.
- Never suggest direct Grist API writes or raw broker calls.
- Start with `grist_list_documents`.
- Read schema with `grist_get_schema` before any write plan.
- Read a bounded sample with `grist_get_sample` when row shape or ids matter.
- Create writes with `grist_plan_add_rows` or `grist_plan_update_rows`.
- Inspect `plan.id`, `status`, `requiresApproval`, `warnings`, and `schemaFingerprint`.
- If `requiresApproval` is true, stop and ask a human to run `grist-approve <planId>`.
- Apply only approved or auto-approved plans with `grist_apply_plan`.
- Never claim success until `grist_apply_plan` or `grist_get_execution` shows confirmed execution status.
- Report `requestId`, `plan.id`, and `execution.id` in your summary when available.

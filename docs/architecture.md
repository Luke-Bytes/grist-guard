# Architecture

## Trust boundaries

- Callers and AI agents are untrusted for arguments and intent.
- The broker is the policy enforcement point and the only AI write path.
- Grist is the downstream data plane and is accessed only with a broker-held API key.

## Core flow

1. Caller sends a typed broker action.
2. Broker authenticates the caller and validates payload shape and policy constraints.
3. Broker persists a plan with immutable normalized action details and a schema fingerprint.
4. Risky plans require explicit approval before apply.
5. Executor revalidates live schema, performs the Grist operation, and stores execution history plus audit events.

## Deliberate exclusions in v1

- Raw Grist endpoint passthrough
- Destructive endpoints
- Arbitrary formulas
- Browser-facing write UI

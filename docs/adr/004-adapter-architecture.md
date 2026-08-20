# ADR 004 — Plugin-Based Device Adapter Architecture

## Status

Accepted

## Context

Device vendors expose incompatible:

- protocols;
- authentication;
- event codes;
- payloads;
- capabilities;
- runtime SDK requirements.

Future vendors are unknown.

## Decision

All vendor integration is isolated behind adapter interfaces and capability declarations.

Core normalization consumes only canonical raw events.

## Reasons

- Prevents vendor lock-in.
- Limits blast radius of SDK quirks.
- Enables independent connector deployment.
- Makes testing with mock adapters possible.
- Allows future vendors without changing downstream HRMS logic.

## Consequences

- Adapter interface must remain small and stable.
- Vendor-specific metadata remains in raw payloads.
- Optional capabilities are represented separately.
- SDK-constrained connectors may require isolated processes.

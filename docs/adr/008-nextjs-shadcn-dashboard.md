# ADR 008: Next.js 15 App Router & shadcn/ui for Operations Control Plane

## Status

Accepted

## Context

Operators require a desktop-first, high-density, real-time control plane to inspect multi-vendor fleets, live biometric streams, synchronization checkpoint states, and raw SHA-256 fingerprint calculations.

## Decision

Build `@attendance/dashboard` using Next.js 15 (App Router), React 19, TailwindCSS, and shadcn/ui components with a dark glassmorphic interface, client-side auto-reconnection error boundaries, and interactive inspection drawers.

## Consequences

- **Positive**: Blazing fast server-rendered routes, high data density, responsive UI, sub-second telemetry inspection.

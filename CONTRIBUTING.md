# Contributing to SolYan PDF

## Project direction

SolYan PDF is **web-first and PWA-ready**. The backend and engine adapters must remain reusable by future desktop/mobile clients.

## Working rules

1. Keep each change small and focused.
2. Do not mix unrelated features in one commit.
3. Preserve adapter boundaries; UI and product code must not depend directly on a specific PDF binary when an adapter can isolate it.
4. Prefer permissively licensed dependencies for the core product.
5. Before implementing difficult functionality from scratch, research maintained open-source projects, verify the exact license, and benchmark quality.
6. Treat AGPL, open-core, proprietary, and commercial-license code as explicit boundaries. Do not copy such code into the permissive core without a deliberate license decision.
7. Prefer browser-side processing for lightweight/private operations; use backend workers for CPU-heavy, network-dependent, OCR, Office, and large-file tasks.
8. Keep Vietnamese Utilities independent from PDF engines.

## Branch and commit convention

- `main`: stable integration branch.
- Feature branches: `feat/<short-name>`.
- Fix branches: `fix/<short-name>`.
- Research branches: `research/<short-name>`.

Recommended commit prefixes:

- `feat:` new functionality
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` behavior-preserving refactor
- `test:` tests/benchmarks
- `build:` build/dependency/tooling
- `research:` benchmark or proof-of-concept work

## Coding conventions

### Frontend
- TypeScript by default.
- React/Next.js.
- Keep business logic outside presentation components.
- Prefer small reusable components and pure utility functions.
- Accessibility and responsive behavior are required for user-facing tools.

### Backend
- Expose stable API contracts independent of individual engines.
- Long-running jobs must be modeled as jobs/workers rather than blocking request handlers.
- Validate file type, size, and user inputs before engine execution.
- Temporary files must have explicit cleanup rules.

### Engine adapters
Each adapter should expose a narrow contract and include:
- capability description
- dependency/license note
- input/output constraints
- deterministic error mapping
- benchmark or test coverage before becoming the default engine

## Quality gates

A feature is not complete until:
- normal path works;
- invalid input is handled;
- Vietnamese text/file-name handling is tested where relevant;
- license/dependency impact is recorded;
- UI works on desktop and mobile widths;
- engine-specific failures are mapped to a product-level error.

## Security and privacy

- Do not persist uploaded documents longer than required for processing.
- Do not log document contents or credentials.
- Password-protected PDFs may only be processed with credentials supplied by the user.
- Client-side processing is preferred when it materially improves privacy without sacrificing reliability.

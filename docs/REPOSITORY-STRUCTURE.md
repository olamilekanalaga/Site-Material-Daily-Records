# Repository structure

This repository keeps the current DJ Civils delivery log and an earlier dashboard in separate application roots. Paths below are relative to the repository root.

```text
.
├── README.md                     # Starting point and commands
├── docs/
│   ├── REPOSITORY-STRUCTURE.md    # This guide
│   ├── archive/                  # Earlier handoff and project brief
│   └── screenshots/              # Preserved earlier dashboard screenshots
├── saas/                         # Current Next.js application; Vercel root
│   ├── docs/                     # Deployment, security and validation
│   ├── public/                   # Logo, marshal photos, icons and PWA files
│   ├── scripts/                  # Supabase demo provisioning
│   ├── src/
│   │   ├── app/                  # Next.js pages, layout and API routes
│   │   ├── components/
│   │   │   ├── auth/             # Team sign-in
│   │   │   ├── delivery-log/     # Home, delivery form and records table
│   │   │   ├── demo/             # Demo entry and profile controls
│   │   │   ├── shared/           # Shared branding
│   │   │   └── legacy/           # Retained earlier pilot interface
│   │   └── lib/
│   │       ├── client/           # Browser transport and pending drafts
│   │       ├── demo/             # Fictional demo engine and browser storage
│   │       ├── server/           # Validation, sessions and backend adapters
│   │       ├── reporting.ts      # Shared tally and quantity helpers
│   │       ├── site-time.ts      # Site timezone conversion
│   │       └── types.ts          # Shared data contracts
│   ├── supabase/migrations/      # Ordered database and RLS migrations
│   ├── tests/
│   │   ├── unit/                 # Demo engine, drafts, reporting and time
│   │   ├── integration/          # Local database and PostgreSQL/RLS tests
│   │   ├── e2e/                  # HTTP API and browser workflows
│   │   └── all.ts                # Unit/integration test runner
│   └── package.json              # SaaS scripts and dependencies
├── source/                       # Independent earlier Vite dashboard
├── public/                       # Earlier dashboard's compiled snapshot
├── scripts/                      # Earlier dashboard maintenance tools
├── tests/                        # Earlier dashboard regression tests
├── package.json                  # Earlier dashboard scripts
└── vercel.json                   # Earlier dashboard deployment settings
```

## Where to make changes

| Task                                                  | Location                                               |
| ----------------------------------------------------- | ------------------------------------------------------ |
| Home, marshal selection or delivery entry             | `saas/src/components/delivery-log/`                    |
| Supervisor records and photo viewer                   | `saas/src/components/delivery-log/simple-records.tsx`  |
| Login                                                 | `saas/src/components/auth/login.tsx`                   |
| Demo entry screen                                     | `saas/src/components/demo/`                            |
| Demo sample data or simulated API                     | `saas/src/lib/demo/`                                   |
| Pending attempts, upload retries or browser transport | `saas/src/lib/client/`                                 |
| Authenticated API endpoints                           | `saas/src/app/api/`                                    |
| Sessions, permissions, persistence or validation      | `saas/src/lib/server/`                                 |
| Database changes                                      | A new ordered migration in `saas/supabase/migrations/` |
| Production setup                                      | `saas/docs/DEPLOYMENT.md` and `saas/.env.example`      |

The team entrypoint is `saas/src/app/page.tsx`. Demo entrypoints under `saas/src/app/demo/` cover marshal selection, `delivery/[profile]/`, `records/` and the separate `supervisor/` records view. Components under `components/legacy/` retain the earlier pilot interface for reference and compatibility; active pages do not import them. Existing backend routes and historical records remain available.

## Conventions

- Keep routing files in `src/app/` and reusable UI in the appropriate `src/components/` folder.
- Use direct module imports. Keep shared browser/server types and pure helpers separate from browser-only storage and server adapters.
- Keep configuration, lockfiles, environment files and `public/` at the `saas/` root as required by Next.js and the existing deployment.
- Keep database migrations in order. Add migrations instead of rewriting applied history.
- Put tests beside their test category and register unit/integration suites in `tests/all.ts`. Browser suites remain under `tests/e2e/` for the existing Playwright configurations.
- Store application-specific operating guides in `saas/docs/`; store repository-wide guidance in `docs/`. Archived notes are historical context, not current setup instructions.
- Keep generated builds, dependencies, local databases and test output out of Git using the existing ignore files.

The earlier dashboard under `source/` has its own [protected runtime rules](../source/AGENTS.md). Its root location, compiled snapshot and build commands remain separate from the SaaS. See the [archived handoff](archive/legacy-dashboard.md) for its preserved operational context.

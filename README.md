# DJ Civils delivery log

The active application lives in [`saas/`](saas/README.md). The production integration keeps two authenticated pages: **Gate Delivery** (`/gate`) and **Delivery Records** (`/records`). Supabase provides staff login, shared PostgreSQL records and private photos. The existing browser-local demo remains explicit at `/demo`; its sample arrivals are never live company data. The integration is prepared on a feature branch for review, with no production merge/deployment authorised by this change.

## Run the SaaS

Use Node.js 22.13 or newer; Node.js 24 is recommended. From the repository root:

```bash
cd saas
npm ci
npm run dev
```

An unconfigured homepage offers the two accessible demos and two disabled staff choices. Once staff settings are configured, it offers the approved staff entrances. `/demo` and `/demo/supervisor` still need no credentials and store their records/photos in that browser only. For live setup, start with the [production audit](saas/docs/PRODUCTION-AUDIT.md) and [deployment guide](saas/docs/DEPLOYMENT.md). See the [smart arrivals guide](saas/docs/SMART-ARRIVALS.md) for the preserved demo and the [SaaS guide](saas/README.md) for both modes.

## Repository map

| Folder                                  | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| [`saas/`](saas/README.md)               | Current Next.js delivery log, APIs, database migrations and tests |
| [`docs/`](docs/REPOSITORY-STRUCTURE.md) | Repository structure, archived project notes and screenshots      |
| `source/`                               | Preserved earlier Vite dashboard and its protected runtime        |
| `public/`                               | Compiled snapshot of that earlier dashboard                       |
| `scripts/`                              | Earlier dashboard migration and snapshot verification tools       |
| `tests/`                                | Earlier dashboard regression tests                                |

The [folder guide](docs/REPOSITORY-STRUCTURE.md) explains where new code belongs. Deployment, security and validation instructions for the current app live in [`saas/docs/`](saas/docs/DEPLOYMENT.md).

## Checks and deployment

Run SaaS checks from `saas/`:

```bash
npm run typecheck
npm test
npm run build
npm run test:demo
npx playwright test tests/e2e/ui.spec.ts
npx playwright test tests/e2e/simple-api.spec.ts tests/e2e/portal-api.spec.ts --project=api
```

Vercel's SaaS project uses **`saas` as its root directory** and `saas/vercel.json`. Keep that deployment root in place. The root `package.json`, `vercel.json`, `public/` and `source/` belong to the independent earlier dashboard; root `npm test`, `npm run lint` and `npm run build` continue to check that dashboard. Root build verifies the existing snapshot rather than compiling the SaaS.

The earlier dashboard's records, publication context and build instructions are preserved in the [archived handoff](docs/archive/legacy-dashboard.md). Follow [`source/AGENTS.md`](source/AGENTS.md) before changing its protected runtime. The SaaS does not import or serve that dashboard's records.

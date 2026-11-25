# DJ Civils delivery log

The active application lives in [`saas/`](saas/README.md). Staff use Supabase to register with a unique email address, sign in and record IN or OUT at [`/gate`](saas/src/app/gate/page.tsx). [`/records`](saas/src/app/records/page.tsx) provides site-scoped records, private photos and read-only movement totals for reporting roles. Old `/demo` links lead to staff sign-in.

## Run the SaaS

Use Node.js 22.13 or newer; Node.js 24 is recommended. From the repository root:

```bash
cd saas
npm ci
npm run dev
```

Follow the [deployment guide](saas/docs/DEPLOYMENT.md) to configure Supabase and enable staff registration. An unconfigured homepage shows disabled staff sign-in options.

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

# DJ Civils delivery log

The active application lives in [`saas/`](saas/README.md). Traffic marshals start at **Sign in as**, choose their photo to open **Delivery Records**, then use **Record New Delivery** for the entry form. The browser demo supports one searchable item dropdown, automatic classification and supervisor review of unknown items. The proposed DJ Civils pilot is unofficial; included delivery records are fictional.

## Run the SaaS

Use Node.js 22.13 or newer; Node.js 24 is recommended. From the repository root:

```bash
cd saas
npm ci
npm run dev
```

Open `http://localhost:3000/demo` for the demo without an email or password, or `/demo/supervisor` for combined records and catalogue review. Demo records, photos and catalogue approvals persist in that browser only; they are not shared across devices. See the [smart arrivals guide](saas/docs/SMART-ARRIVALS.md) for capture, classification and reporting, and the [SaaS guide](saas/README.md) for authenticated development and existing Supabase infrastructure.

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

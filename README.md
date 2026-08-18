# Tasks

A Linear-style issue tracker built with Next.js 16 (App Router, Server Components, Server Actions), Drizzle ORM, PostgreSQL, Tailwind CSS, and better-auth with Discord sign-in.

## Features

- Configurable workflow states and labels
- Issues with status, priority, assignee, labels, project, milestone, estimate, due date, parent/sub-issues, relations (blocks / blocked by / related / duplicate), comments with replies that survive their parent's deletion, activity history, subscriptions
- List and board views with filtering, grouping, ordering, and bulk edit
- Projects with lead, members, milestones, health updates, progress, and access restricted to Discord server roles
- Discord due-date reminders: register webhooks per workspace, then per issue post 1 day before, 15 minutes before, or daily until the due date, with an optional custom message
- Inbox notifications, `⌘K` command palette with issue search, and Linear's keyboard model (`C`, `G I`, `G A`, `G B`, `J`/`K`, `S`/`P`/`A`/`L`/`D`, `X`, `?`)
- Light, dark, and system themes

## Development

```bash
bun install
cp .env.example .env.development.local   # optional: DATABASE_URL, ALLOWED_DEV_ORIGINS
bun run dev
```

The first run creates an embedded PostgreSQL database (PGlite) under `.data/development`, applies the migrations, and seeds sample data. Open <http://localhost:3000>.

The sample data spreads projects, issues and comments across **the real Discord server's members** when `.env.development.local` carries a bot token, so a development database looks like production. Without credentials (a fresh clone, or offline) it invents an eight-person team in a workspace called *Acme* instead; tests always use that team and never call Discord. Re-run `bun run db:reset` to rebuild the database from scratch.

## Authentication

Sign-in goes through Discord (better-auth). All authentication configuration lives in the database, not in environment variables: on a fresh install open `/setup` to enter the app's public URL, the Discord application's client ID/secret, the Discord server whose members may sign in, and the bot token. Afterwards the same form is under **Settings › Workspace › Authentication**. Changes apply immediately, no restart needed. The session signing secret is generated together with the workspace row.

Only members of the configured Discord server can sign in (checked at every sign-in via the `guilds` OAuth scope). The redirect URI is always `<app URL>/api/auth/callback/discord`; the settings page shows the exact value to register on the Discord application.

### Who is an admin

Admin follows the Discord server rather than being a flag someone sets here: its owner, anyone holding a role that carries Discord's Administrator permission, and anyone holding a role listed as an admin role. That last list is the configurable part, for roles a server calls senior without giving them Discord's own permission; it is entered at `/setup` and managed afterwards under **Settings › Members › Admins**. A grant made on the members page counts as a fourth reason.

Signing in grants nothing. `/setup` is open to anyone only while the deployment is still being set up — sign-in unconfigured and *nobody* an admin, because a fresh deployment has no one to authorise it — and saving a bot token there reads the server immediately, so the owner and the Administrator roles become admins in the same step and the form closes behind them. That first save is all or nothing: a server it cannot read puts the previous settings back rather than leaving a deployment that is configured and has no admin. The Discord server is fixed once stored, and the field stops being offered: every member, session and reminder here belongs to that server, so a different one is a different deployment rather than an edit.

Admin is deliberately a narrow line: credentials, privilege, and changes that rewrite other people's work. Only admins can change the sign-in configuration, the admin role list, another member's admin flag or their membership, the workspace slug and time zone, and delete a workflow state or a label — those last two because deleting a state moves every issue in it and deleting a label strips it from every issue wearing it. Everything else is open to every member, including creating and renaming labels, adding and reordering workflow states, Discord webhooks and the reminders that post through them, issues, projects, milestones, API tokens and your own profile.

Deleting something somebody wrote is a different question from administering the workspace, and it has one answer throughout: the person who wrote it, or an admin. That covers comments, issues and project updates, while editing stays with the author either way, because an admin moderates rather than ghost-writes. None of it can be undone and nothing is archived instead, so each confirmation says what it costs as a number rather than a warning: the comments, reminders and sub-issues an issue takes with it, the issues that lose a label or a milestone, the issues that move out of a status. Deleting the newest project update also puts the project's health badge back to what the newest surviving update says, because the badge is written from that update and a badge nothing in the feed explains is worse than none.

The rule lives at the boundary (`adminAction` in `lib/session/action.ts`), and `tests/server-actions.test.ts` pins the reach of every server action, so widening one has to be written down.

### The workspace mirrors the Discord server

With the bot token set, the workspace takes its identity from the server:

- **Name and icon** are the server's; renaming the server renames the workspace. The URL slug follows the name only while it is still the placeholder a fresh deployment starts with, so a slug chosen in settings is kept. Time zone stays a workspace setting.
- **Members** are everyone in the server, created as placeholders until they first sign in (at which point the row is linked to their login). Nicknames, usernames, pictures (server-specific avatars win over account ones) and roles follow Discord, on every pass rather than only when the member is first seen. **Settings › Account** disables the name and username fields while the server is mirrored and says where to change them; the e-mail address and the avatar colour are not in the roster and stay editable.
- **People who leave** are signed out and shown as **Former member** with no picture wherever they appear, and they disappear from assignee pickers while their past issues and comments keep the attribution.

How the last pass went is shown above the member list: a mirror that has stopped — the bot removed from the server, its token rotated, the Server Members Intent switched off — is why the roster stops changing, and until it is fixed people who left keep their sessions, their API tokens and any admin their roles carried. A pass that reads a roster too short to believe (empty, or half the workspace missing) mirrors what it read but marks nobody as having left, and says so rather than reporting a clean sync.

The sync runs at server start, every ten minutes, and from **Settings › Members › Sync from Discord**. Listing members requires the bot's **Server Members Intent** (Developer Portal › Bot › Privileged Gateway Intents). Members without a Discord ID (the development seed data) are left untouched. Avatars and the icon are loaded straight from Discord's CDN by the browser, and fall back to initials if a request fails.

### Project access by Discord role

A project can be restricted to members holding one of the server's roles (**Access** in the project's properties). Restricted projects and their issues are hidden from everyone else; admins, the project lead, and explicit project members always keep access. Only admins and the lead can change the roles. Leaving no roles at all opens the project to the whole workspace, so both ways of getting there — unticking the last role, and the **Remove restrictions** button shown while the bot is unconfigured — confirm first and count the issues that become visible.

Reading roles needs a bot: create one on the Discord application's **Bot** tab, paste its token under **Settings › Workspace › Authentication › Discord bot token**, and invite it to the server with the link shown there (`https://discord.com/oauth2/authorize?client_id=<client id>&scope=bot&permissions=0`; no permissions or privileged intents are required). Each member's roles are re-read through the bot at most every five minutes.

## Discord reminders

Register webhooks under **Settings › Workspace › Discord webhooks** (name + URL from the Discord channel's Integrations page). On an issue, **Discord reminders › +** picks a webhook, when the first post goes out (from 15 minutes to a week before the deadline, or at it, or from now on), how often it repeats until the deadline (not at all, hourly, every 6 hours, daily, weekly), the deadline time on the due date, and an optional message (mentions such as `<@&roleId>` ping the role; `@everyone` and `@here` are posted as plain text and ping nobody). The stored cadence is two minute counts — how long before the deadline the series starts and the gap between posts — so the operations API and MCP can pick intervals the form does not list, down to a floor of one hour between posts. Times are interpreted in the workspace time zone (**Settings › Workspace › Time zone**, default `Asia/Seoul`), which is also the zone a due date is judged overdue in — the container may well run UTC, and the day it is there is nobody's business. Reminders for completed or canceled issues are skipped.

Sending is done by an in-process scheduler started from `instrumentation.ts` that checks once a minute, so no external cron is needed. Each due reminder is claimed on its own just before it is posted, by moving its next run forward to a short lease rather than clearing it: an overlapping pass sends nothing rather than sending everything twice, and a pass that stops part-way — a redeploy in the middle of the evening window — leaves everything it did not reach as due as it found it. A post Discord refuses is retried a few times, after the delay a rate limit asks for, and only a delivered occurrence moves the reminder on to its next one — except a webhook Discord no longer has, which stops the reminder and leaves the error on it, rather than spending five 404s on every occurrence for as long as the issue stays open.

A reminder belongs to the issue it is set on rather than to whoever created it, so it keeps posting after they leave the Discord server or lose access to the project. Only somebody who could see the issue could have created it, and the channel it posts to was their choice; who reads that channel is not something this app knows.

## Programmatic access (operations API and MCP)

Everything a client can do is defined once as an **operation** (`lib/operations/catalog/*`): a name such as `issues.create`, a description, a zod input schema and a handler that calls the same server actions and queries the UI uses. The registry (`lib/operations/registry.ts`) validates input, resolves the acting member and runs it; the catalog is exposed as JSON schema so tools can be generated from it.

- **Auth**: personal API tokens from **Settings › Account › API tokens** (`Authorization: Bearer tsk_…`), and nothing else — these are route handlers, which unlike server actions have no origin check, so the browser's session cookie is not accepted here. Tokens act as their owner: project access, admin checks and Discord-membership rules apply unchanged because `findCurrentUser` reads the actor from an `AsyncLocalStorage` context (`lib/session/actor-context.ts`) that `requireActor` fills in from the token.
- **HTTP**: `GET /api/operations` lists operations with input schemas; `POST /api/operations/<name>` with a JSON body runs one and returns `{ result }` (or `{ error, details }` with 400/401/403/404).
- **MCP**: `POST <app URL>/api/mcp` speaks the Model Context Protocol over Streamable HTTP (stateless, JSON responses, no sessions). `tools/list` is the catalog and `tools/call` runs an operation as the token's owner. Tool names replace the dot, so `issues.create` is called as `issues_create`, and operation failures come back as tool content with `isError` rather than protocol errors.

Point a client at it with the same bearer token:

```bash
claude mcp add --transport http tasks https://tasks.example.com/api/mcp \
  --header "Authorization: Bearer tsk_…"
```

Clients that only speak stdio can bridge with `npx mcp-remote https://tasks.example.com/api/mcp --header "Authorization: Bearer tsk_…"`.

To add a capability for every client — the browser aside — add a `defineOperation` entry to a catalog module: it becomes an HTTP endpoint and an MCP tool at once.

## Database

- Schema lives in `lib/database/schema/`; migrations are generated with `drizzle-kit` into `lib/database/migrations/`.
- `DATABASE_URL` selects the engine: `pglite://./.data/development` (default) runs an embedded PostgreSQL in-process; `postgresql://…` connects to a real server for production. Both use the same schema and migrations.
- Seed data is only ever written to the embedded development database, and only when it is empty.

### Schema changes and deploys

1. Edit `lib/database/schema/`, then `bun run db:generate --name <change>` to add an incremental migration. Never edit or regenerate a migration that has been applied anywhere: drizzle applies them by timestamp, so rewriting history breaks every database that already ran them. (The single `0000_initial` is the squashed baseline the first deployment started from, taken while no database outside development existed.) `bun run db:check` validates the migration set.
2. Migrations run automatically when the app opens the database, serialised across instances with a Postgres advisory lock, so a rolling deploy applies them once. To apply them explicitly before the new build serves traffic instead, set `DATABASE_MIGRATE_ON_START=false` and run `bun run db:migrate` in the pipeline.
3. Migrations are forward-only (no down files); take a database backup before deploying a schema change and fix forward. Keep destructive changes (drops, renames, type changes) as expand → deploy → contract steps, so the previous build still runs against the migrated database if you have to roll back. Enum values are added with `ALTER TYPE … ADD VALUE`, which cannot be used by rows written in the same transaction. Drizzle runs *every* pending migration in one transaction, so splitting the value and the backfill across two files does not split the transaction when both are pending — it takes two **deploys**: ship the migration that adds the value, let it commit, then ship the one that backfills.
4. A fresh production database gets a placeholder workspace row created on first open; visit `/setup` to configure sign-in, after which the workspace takes the Discord server's name and icon. Seed data is never written to PostgreSQL.
5. Data backfills are ordinary SQL statements appended to the generated migration file (separated by `--> statement-breakpoint`).

## Deployment

One deployment serves one workspace, mirrored from one Discord server. Everything it needs at run time is `DATABASE_URL`; the Discord application, the allowed server, the bot token and the public URL live in the database and are entered at `/setup`.

```bash
cp deploy/.env.example deploy/.env        # set POSTGRES_PASSWORD
docker compose -f deploy/compose.yml up -d --build
```

That starts PostgreSQL 18 on a named volume and the app, speaking plain HTTP on port 3000 inside the compose network. Nothing is published to the host: hostname and TLS belong to a reverse proxy that joins the network, added as a second compose file so `deploy/compose.yml` stays the same everywhere.

The engine major matters. The test suite runs on the embedded PGlite engine, which is PostgreSQL 18, so `deploy/compose.yml` pins `postgres:18-alpine` and the suite verifies the engine production actually runs. A deployment already on 17 cannot simply take the newer file: the 18 images keep their data in a major-version subdirectory and refuse to start against a volume mounted at `/var/lib/postgresql/data`, which is where 17 put it, so the mount moved up to `/var/lib/postgresql` — and the data itself crosses the major with `pg_dump`: dump on 17, `down -v`, `up -d` on 18, restore (both commands are under *Operations* below).

**Behind Traefik.** With a [traefik-compose](https://github.com/jaewonyu-cs/traefik-compose) stack already running — it owns the external `proxy` network, terminates TLS and redirects `:80` to `:443` — the app needs a router rule and the port behind it, nothing more. Copy `deploy/compose.override.example.yml` to `deploy/compose.override.yml` (git-ignored), set the host, and:

```bash
docker compose -f deploy/compose.yml -f deploy/compose.override.yml up -d --build
```

Note that `default` has to stay in the service's `networks` list. Naming networks in an override replaces the list rather than adding to it, and dropping `default` would cut the app off from PostgreSQL.

The example file also points Traefik's health check at `/api/health`, so an instance that cannot reach its database is taken out of the pool instead of being handed traffic for as long as its container is running.

Behind any proxy the app only learns who is calling from `x-forwarded-for`, and sign-in rate limits are keyed on that address: a whole lecture hall on one campus NAT address shares one budget, so the limit for the Discord redirect is 30 a minute rather than better-auth's password-shaped default of 3 per 10 seconds. Which hops in the header are the deployment's own is `TRUSTED_PROXY_CIDRS`, and its default covers Docker's address pool; a proxy running on the host, or a Docker installation with a custom address pool, sets it in `deploy/.env`.

**Without a proxy yet** — to open `/setup` the first time, say — publish a local port instead:

```yaml
# deploy/compose.local.yml
services:
  app:
    ports: ["127.0.0.1:3100:3000"]
```

```bash
docker compose -f deploy/compose.yml -f deploy/compose.local.yml up -d
```

A proxy running on the host rather than in Docker uses that same file and points at `127.0.0.1:3100`. Either way the app URL entered at `/setup` must be the public `https://…` one, since sign-in redirects and cookies follow it.

**First run.** Open `https://<your domain>/setup` and fill in the app URL, the Discord application's client ID and secret, the server ID, the bot token and the admin role IDs. The page shows the redirect URI to register on the Discord application (`https://<your domain>/api/auth/callback/discord`). The server ID and bot token are required here — they are what lets the save read the server, and reading the server is the only thing that makes anyone an admin, so a save without them would leave a deployment nobody can administer and a `/setup` anyone can rewrite. With them, saving reads the server straight away: its owner and its Administrator roles become admins alongside the roles listed, the workspace takes the server's name, icon and members, and `/setup` stops being public.

**Upgrades** are `docker compose -f deploy/compose.yml up -d --build`, which replaces the container: expect roughly ten seconds of downtime while the new one starts. Run one instance — the background jobs (reminders, Discord sync) are in-process and would otherwise fire twice.

Builds are tagged `tasks-app:$TASKS_IMAGE_TAG` (`latest` when unset), so give each deploy a tag of its own and the one it replaced is still on the host to go back to:

```bash
TASKS_IMAGE_TAG=2026-08-17 docker compose -f deploy/compose.yml up -d --build   # deploy
docker image ls tasks-app                                                       # what is there to go back to
TASKS_IMAGE_TAG=2026-08-16 docker compose -f deploy/compose.yml up -d           # roll back, no rebuild
```

Set the tag in `deploy/.env` to make it stick. A rollback only undoes the code: migrations are forward-only, so the build you roll back to has to be one that still runs against the migrated schema — which is what the expand → deploy → contract rule above is for.

**If a deploy cannot start** — no `DATABASE_URL`, a database it cannot reach, a migration that fails — the container logs one `[startup]` line and exits, so `restart: unless-stopped` restarts it and the crash-loop is visible in `docker compose ps`. It does not come up and serve 500s. Roll back to the previous tag while you read the logs.

**Migrations** are applied when the app opens the database, serialised with a PostgreSQL advisory lock so simultaneous starts apply them once. To apply them before the new code serves traffic instead, set `DATABASE_MIGRATE_ON_START=false` in `deploy/.env` and run:

```bash
docker compose -f deploy/compose.yml run --rm app bun run db:migrate
```

**Operations.**

```bash
docker compose -f deploy/compose.yml logs -f app          # [jobs], [discord], [reminders], [auth]
curl -fsS http://127.0.0.1:3100/api/health                # {"status":"ok"}, 503 if the database goes away
docker compose -f deploy/compose.yml exec postgres \
  pg_dump -U tasks tasks | gzip > tasks-$(date +%F).sql.gz   # back up: see below
gunzip -c tasks-2026-08-17.sql.gz | docker compose -f deploy/compose.yml \
  exec -T postgres psql -U tasks -d tasks                    # restore into an empty database
docker compose -f deploy/compose.yml down                 # stop; add -v to discard the database
```

Take that dump before every schema change, and on a schedule. The volume is not only the issues: the workspace row holds the session signing secret, the Discord client secret and the bot token, because all authentication configuration lives in the database. Losing the volume means re-creating the Discord application's secret and the bot token and signing everybody out, not just losing work.

The image carries Bun, the built app and its dependencies (~1.3 GB, mostly the Next.js toolchain) and runs as a non-root user. It contains no secrets: `.env*` files are excluded from the build context.

## Structure

```text
app/              routes (App Router) and API route handlers
components/       UI, one component per file
lib/<domain>/     types.ts (view models), queries.ts (reads), actions.ts ("use server" mutations)
lib/auth/         better-auth configuration, sign-in lifecycle, workspace auth settings
lib/discord/      Discord REST client, member/role sync, webhooks
lib/operations/   transport-neutral operation catalog (HTTP today, MCP later)
lib/jobs/         background jobs (reminders, member sync)
lib/session/      current user + actor context (cookie session, API token, jobs)
lib/database/     Drizzle schema, migrations, client, seed, development bootstrap
lib/validation/   shared zod schemas, lib/errors.ts the failures the domain expects
tests/            bun tests
```

Read models follow one naming scheme: `<Thing>Summary` is the compact projection embedded in other payloads, `<Thing>ListItem` is a row in a list, `<Thing>Detail` is what one page needs. Zod schemas live in `lib/validation` rather than beside the display helpers, because those are imported by client components and zod must not reach the browser.

Conventions: every export of a `"use server"` module is wrapped in `action()` from `lib/session/action.ts`, which resolves the signed-in member before the body runs and passes it in — server actions are HTTP endpoints and nothing upstream authenticates them, so the two places where being signed out is part of the feature use `publicAction()` and say why; `tests/server-actions.test.ts` fails when an export carries neither. Mutations open their target once (`openIssue`, `openProject`) which validates the identifier and applies project access, then express only the change; actions whose failure message must reach the UI return `ActionResult` instead of throwing; every mutation ends with `revalidateEverything()`. Pages and list rows are server components; only the interactive parts (pickers, editors, row click shells) are `"use client"` islands, and rarely-opened overlays (command palette, new-issue dialog) are code-split with `lazyOverlay` and prefetched when the browser is idle. Client components must not import server-only modules (database, Discord API, zod schemas) — use `lib/database/schema/enum-values` and browser-safe helpers instead.

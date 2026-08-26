# Six Degrees

A mobile-first, offline-capable app for playing "six degrees of separation" with
movies. Add movies (with their cast and viewing diary) and actors (with their
filmography), then open the graph view to find the shortest chain of shared
actors connecting any two films.

Built with Bun + React 19. All data lives in `localStorage` (a single JSON
blob), and a service worker caches the app shell so it works fully offline as an
installable PWA.

## Getting started

```bash
bun install
bun dev      # http://localhost:3000 with hot reload
bun start    # production server
bun test     # unit tests for the graph logic
```

## How it works

- **Data model** — a bipartite graph: `movies`, `actors`, and `appearances`
  (an actor in a movie). See [`src/lib/types.ts`](src/lib/types.ts).
- **Pure operations** — all mutations and the BFS pathfinder are pure,
  immutable functions in [`src/lib/graph.ts`](src/lib/graph.ts) (unit-tested in
  `graph.test.ts`).
- **Store** — a tiny `useSyncExternalStore` wrapper that persists to
  localStorage on every change ([`src/lib/store.ts`](src/lib/store.ts)).
- **Forms** — movie and actor forms are the same shared
  [`EntityForm`](src/components/EntityForm.tsx), configured per kind in
  [`src/lib/entityConfig.ts`](src/lib/entityConfig.ts). Adding a related entity
  auto-creates its node; tapping one jumps to its form.
- **Autocomplete** — [`Autocomplete`](src/components/Autocomplete.tsx) reads from
  a pluggable [`SuggestionSource`](src/lib/suggestions.ts). Today it searches
  your own data; a remote source (e.g. TMDb) can be merged in later without
  touching the components.
- **Graph view** — [`GraphView`](src/routes/GraphView.tsx) projects the bipartite
  graph onto movies (linked when they share an actor) and renders it with
  Cytoscape ([`MovieGraph`](src/components/MovieGraph.tsx)). Pick a start and end
  movie to highlight the shortest path and list the actor chain.
- **Remote backup** — optional, opt-in backup of the localStorage blob to a
  private GitHub Gist ([`src/lib/gist.ts`](src/lib/gist.ts),
  [`src/lib/backup.ts`](src/lib/backup.ts)). Configure it from `/settings`
  with a fine-grained personal access token scoped to **"Gists: read and
  write"** and either an existing gist ID or let it create one. Backups run
  automatically while the app is open and online (and can be triggered
  manually), storing one file per month (`backup-YYYY-MM.json`) and skipping
  the upload when nothing changed. A "Restore latest backup" button pulls
  the newest file back down, e.g. onto a fresh device. The token is kept in
  localStorage in plaintext, which is an acceptable trade-off for a personal
  project but worth knowing.

## Routes

- `/` — home: movie & actor lists, add buttons
- `/movie/:id`, `/movie/new` — movie form
- `/actor/:id`, `/actor/new` — actor form
- `/diary` — all movie diary entries, newest first
- `/graph` — the connection game
- `/settings` — configure remote Gist backup, trigger manual backup/restore

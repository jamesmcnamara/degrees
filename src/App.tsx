import { Link, Route, Switch, useLocation } from "wouter";
import { Home } from "./routes/Home";
import { GraphView } from "./routes/GraphView";
import { Diary } from "./routes/Diary";
import { EntityForm } from "./components/EntityForm";
import { ENTITY_CONFIG } from "./lib/entityConfig";
import * as store from "./lib/store";
import type { EntityKind, Id } from "./lib/types";
import "./index.css";

export function App() {
  return (
    <div className="shell">
      <Header />
      <main className="content">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/diary" component={Diary} />
          <Route path="/graph" component={GraphView} />
          <Route path="/movie/:id">
            {(p) => (
              <EntityForm key={`movie:${p.id}`} kind="movie" id={p.id!} />
            )}
          </Route>
          <Route path="/actor/:id">
            {(p) => (
              <EntityForm key={`actor:${p.id}`} kind="actor" id={p.id!} />
            )}
          </Route>
          <Route>
            <p className="muted">Not found.</p>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

function Header() {
  const [location, navigate] = useLocation();
  const title = titleFor(location);
  const atRoot = location === "/";
  const entityRoute = entityRouteFor(location);

  const removeSubject = () => {
    if (!entityRoute) return;
    store.deleteEntity(entityRoute.kind, entityRoute.id);
    navigate("/");
  };

  return (
    <header className="appbar">
      {atRoot ? (
        <Link href="/" className="appbar__brand">
          Six Degrees
        </Link>
      ) : (
        <button
          type="button"
          className="appbar__back"
          onClick={() => history.back()}
          aria-label="Back"
        >
          ‹ <span>{title}</span>
        </button>
      )}
      {atRoot ? (
        <nav className="appbar__actions">
          <Link href="/diary" className="appbar__action">
            Diary
          </Link>
          <Link href="/graph" className="appbar__action">
            Play
          </Link>
        </nav>
      ) : entityRoute ? (
        <details className="appbar__menu">
          <summary className="appbar__menu-toggle" aria-label="Open menu">
            ⋮
          </summary>
          <div className="appbar__menu-panel">
            <button
              type="button"
              className="appbar__menu-action appbar__menu-action--danger"
              onClick={removeSubject}
            >
              Delete {ENTITY_CONFIG[entityRoute.kind].noun}
            </button>
          </div>
        </details>
      ) : null}
    </header>
  );
}

interface EntityRoute {
  kind: EntityKind;
  id: Id;
}

const entityRouteFor = (location: string): EntityRoute | null => {
  for (const kind of ["movie", "actor"] as EntityKind[]) {
    const prefix = `/${kind}/`;
    if (location.startsWith(prefix)) {
      const id = location.slice(prefix.length);
      return id && id !== "new" ? { kind, id } : null;
    }
  }
  return null;
};

const titleFor = (location: string): string => {
  if (location === "/graph") return "Connection";
  if (location === "/diary") return "Diary";
  for (const kind of ["movie", "actor"] as EntityKind[]) {
    if (location.startsWith(`/${kind}/`)) {
      const id = location.split("/")[2];
      return id === "new"
        ? `New ${ENTITY_CONFIG[kind].noun}`
        : ENTITY_CONFIG[kind].noun;
    }
  }
  return "Home";
};

export default App;

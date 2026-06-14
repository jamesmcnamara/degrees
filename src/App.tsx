import { Link, Route, Switch, useLocation } from "wouter";
import { Home } from "./routes/Home";
import { GraphView } from "./routes/GraphView";
import { EntityForm } from "./components/EntityForm";
import { ENTITY_CONFIG } from "./lib/entityConfig";
import type { EntityKind } from "./lib/types";
import "./index.css";

export function App() {
  return (
    <div className="shell">
      <Header />
      <main className="content">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/graph" component={GraphView} />
          <Route path="/movie/:id">
            {(p) => <EntityForm key={`movie:${p.id}`} kind="movie" id={p.id!} />}
          </Route>
          <Route path="/actor/:id">
            {(p) => <EntityForm key={`actor:${p.id}`} kind="actor" id={p.id!} />}
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

  return (
    <header className="appbar">
      {atRoot ? (
        <span className="appbar__brand">Six Degrees</span>
      ) : (
        <button
          type="button"
          className="appbar__back"
          onClick={() => navigate("/")}
          aria-label="Back"
        >
          ‹ <span>{title}</span>
        </button>
      )}
      {atRoot && (
        <Link href="/graph" className="appbar__action">
          Play
        </Link>
      )}
    </header>
  );
}

const titleFor = (location: string): string => {
  if (location === "/graph") return "Connection";
  for (const kind of ["movie", "actor"] as EntityKind[]) {
    if (location.startsWith(`/${kind}/`)) {
      const id = location.split("/")[2];
      return id === "new" ? `New ${ENTITY_CONFIG[kind].noun}` : ENTITY_CONFIG[kind].noun;
    }
  }
  return "Home";
};

export default App;

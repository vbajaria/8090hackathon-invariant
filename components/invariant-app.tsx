"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Code2,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  GitBranch,
  GitCompareArrows,
  Github,
  Layers3,
  LayoutDashboard,
  Loader2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Unplug,
  Workflow,
  X,
} from "lucide-react";
import type {
  Classification,
  Connection,
  Evidence,
  Finding,
  Run,
  Status,
  Step,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { WorkflowGraph } from "@/components/workflow-graph";

type View = "dashboard" | "new-run" | "execution" | "evidence";
type Dashboard = {
  runs: Run[];
  connection: Connection;
  stats: {
    runs: number;
    regressions: number;
    invariants: number;
    reports: number;
  };
};
const PROJECT = "111f2375-bea8-4c31-8eb4-dca7f3398144";
const REPOSITORY = "https://github.com/vbajaria/8090hackathon-invariant";
const REQUEST =
  "Refactor this application into modular, well-documented, type-safe Python components. Improve testability and separation of concerns without changing established financial calculation behavior.";
const classifications: Classification[] = [
  "MUST_PRESERVE",
  "INTENTIONAL_CHANGE",
  "UNKNOWN",
];
const classificationLabel = (value: Classification) =>
  ({
    MUST_PRESERVE: "Must preserve",
    INTENTIONAL_CHANGE: "Intentional change",
    UNKNOWN: "Needs review",
  })[value];
const statusLabel = (value: Status) =>
  ({
    pending: "Pending",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    awaiting_action: "Action needed",
  })[value];
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const valueText = (value: unknown) =>
  value === undefined
    ? "Not recorded"
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
const isActive = (run?: Run | null) =>
  run?.status === "running" || run?.status === "pending";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : `Request failed (${response.status}). Please try again.`,
    );
  if (!data) throw new Error("The server returned an empty response.");
  return data as T;
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  );
}
function Empty({
  icon: Icon = Fingerprint,
  title,
  children,
}: {
  icon?: typeof Fingerprint;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <div className="empty-description">{children}</div>
    </div>
  );
}

export function InvariantApp() {
  const [view, setView] = useState<View>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Classification>>({});
  const connection = dashboard?.connection;
  const connectionTrigger = useRef<HTMLElement | null>(null);
  const openConnection = () => {
    connectionTrigger.current = document.activeElement as HTMLElement | null;
    setConnectionOpen(true);
  };
  useEffect(() => {
    if (!connectionOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      connectionTrigger.current?.focus();
    };
  }, [connectionOpen]);
  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await api<Dashboard>("/api/dashboard"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);
  useEffect(() => {
    if (!run || !isActive(run)) return;
    const controller = { stopped: false };
    const timer = setInterval(async () => {
      try {
        const next = await api<Run>(`/api/runs/${run.id}`);
        if (!controller.stopped) {
          setRun(next);
          setError(null);
          if (!isActive(next)) void loadDashboard();
        }
      } catch (e) {
        if (!controller.stopped)
          setError(e instanceof Error ? e.message : "Run polling failed.");
      }
    }, 2200);
    return () => {
      controller.stopped = true;
      clearInterval(timer);
    };
  }, [run?.id, run?.status, loadDashboard]);
  useEffect(() => {
    if (view !== "dashboard") return;
    const timer = setInterval(() => void loadDashboard(), 6000);
    return () => clearInterval(timer);
  }, [view, loadDashboard]);
  useEffect(() => {
    setEdits({});
  }, [run?.id]);
  useEffect(() => {
    if (!run?.evidence || isActive(run)) return;
    setEdits((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([id, value]) =>
            run.evidence?.invariants.find((inv) => inv.id === id)
              ?.classification !== value,
        ),
      ),
    );
  }, [run?.evidence, run?.status]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const openRun = async (id: string, nextView: View = "execution") => {
    setBusy(`open:${id}`);
    setError(null);
    try {
      setRun(await api<Run>(`/api/runs/${id}`));
      setView(nextView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open run.");
    } finally {
      setBusy(null);
    }
  };
  const action = async (name: string, body: unknown = {}) => {
    if (!run) return;
    setBusy(name);
    setError(null);
    try {
      setRun(await api<Run>(`/api/runs/${run.id}/${name}`, body));
      void loadDashboard();
      setNotice(
        name === "verify"
          ? "Verification started. Evidence will update as the oracle completes."
          : name === "submit"
            ? "Work order submitted to Software Factory."
            : name === "attach"
            ? "Existing 8090 work order associated with this run."
          : name === "remediate"
              ? "Remediation work order connected."
              : "Factory artifacts refreshed.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  };
  const createRun = async (body: unknown) => {
    setBusy("create");
    setError(null);
    try {
      setRun(await api<Run>("/api/runs", body));
      setView("execution");
      void loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create run.");
    } finally {
      setBusy(null);
    }
  };
  const refreshConnection = async () => {
    setBusy("connection");
    setError(null);
    try {
      const next = await api<Connection>("/api/connection", {});
      setDashboard((current) =>
        current ? { ...current, connection: next } : current,
      );
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection check failed.");
    } finally {
      setBusy(null);
    }
  };
  const copyHandoff = async () => {
    if (!run?.handoff) return;
    try {
      await navigator.clipboard.writeText(run.handoff);
      setNotice(
        "Agent handoff copied. Paste it into your MCP-connected coding agent.",
      );
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the handoff text below.",
      );
    }
  };
  const nav = (next: View) => {
    setView(next);
    setError(null);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => nav("dashboard")}
          aria-label="Invariant dashboard"
        >
          <Mark />
          <span>
            INVARIANT<span className="brand-caption">BEHAVIOR, PRESERVED.</span>
          </span>
        </button>
        <div className="workspace-picker">
          <span className="workspace-avatar">IV</span>
          <span>
            Invariant workspace<small>Development</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => nav("dashboard")}
          >
            <LayoutDashboard size={17} />
            Overview
          </button>
          <button
            className={`nav-item ${view === "new-run" ? "active" : ""}`}
            onClick={() => nav("new-run")}
          >
            <Plus size={17} />
            New verification<span className="key-hint">＋</span>
          </button>
          <button
            className={`nav-item ${view === "execution" ? "active" : ""}`}
            onClick={() => nav("execution")}
          >
            <Workflow size={17} />
            Execution{isActive(run) && <span className="live-dot" />}
          </button>
          <button
            className={`nav-item ${view === "evidence" ? "active" : ""}`}
            onClick={() => nav("evidence")}
          >
            <FileCheck2 size={17} />
            Evidence explorer
          </button>
        </nav>
        <div className="nav-label projects-label">
          PROJECTS <span>01</span>
        </div>
        <button className="project-item" onClick={() => nav("dashboard")}>
          <span className="project-square" />
          Invariant
          <span className="muted-dot" />
        </button>
        <div className="sidebar-bottom">
          <button className="connection-card" onClick={openConnection}>
            <span
              className={`connection-light ${connection?.connected ? "connected" : ""}`}
            />
            <span>
              Software Factory
              <small>
                {!connection
                  ? "Checking connection"
                  : connection.connected
                    ? "Connected to project"
                    : connection.configured
                      ? "Connection unavailable"
                      : "Credentials not configured"}
              </small>
            </span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="user-avatar">IV</span>
            <span>
              Invariant<small>Verification workspace</small>
            </span>
            <span className="version">v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="slash">/</span>
            <span>Invariant</span>
            <span className="slash">/</span>
            <strong>
              {
                {
                  dashboard: "Overview",
                  "new-run": "New verification",
                  execution: "Execution",
                  evidence: "Evidence explorer",
                }[view]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Software Factory connection details"
              onClick={openConnection}
            >
              <Radio size={16} />
            </button>
            <span className="environment">
              <span />
              LOCAL WORKSPACE
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              onClick={() => void loadDashboard()}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>
        <main id="main-content">
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={17} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={17} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {view === "dashboard" && (
            <DashboardView
              dashboard={dashboard}
              loading={loading}
              search={search}
              setSearch={setSearch}
              onCreate={() => nav("new-run")}
              onOpen={openRun}
              busy={busy}
            />
          )}
          {view === "new-run" && (
            <NewRunView
              onCreate={createRun}
              busy={busy === "create"}
              onBack={() => nav("dashboard")}
              projectId={connection?.projectId || PROJECT}
            />
          )}
          {view === "execution" &&
            (run ? (
              <ExecutionView
                run={run}
                connection={connection}
                busy={busy}
                onAction={action}
                onEvidence={() => nav("evidence")}
                onCopy={copyHandoff}
                onConnect={openConnection}
              />
            ) : (
              <NoRun onCreate={() => nav("new-run")} />
            ))}
          {view === "evidence" &&
            (run ? (
              <EvidenceView
                run={run}
                edits={edits}
                setEdits={setEdits}
                busy={busy}
                onAction={action}
                onExecution={() => nav("execution")}
              />
            ) : (
              <NoRun onCreate={() => nav("new-run")} />
            ))}
        </main>
        <footer className="main-footer">
          <span>
            <ShieldCheck size={13} /> Independent evidence. Not agent
            confidence.
          </span>
          <span>
            INVARIANT <span className="footer-separator">/</span>{" "}
            {new Date().getFullYear()}
          </span>
        </footer>
      </div>
      {connectionOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setConnectionOpen(false)}
        >
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConnectionOpen(false);
              if (e.key === "Tab") {
                const elements = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]',
                  ),
                );
                const first = elements[0];
                const last = elements[elements.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="panel-heading">
              <div className="icon-tile">
                <Boxes size={22} />
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close connection settings"
                onClick={() => setConnectionOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <h2 id="connection-title">Software Factory connection</h2>
            <p>
              Credentials stay on your server. They are never entered or stored
              in this browser.
            </p>
            <div
              className={`alert ${connection?.connected ? "success" : "warning"}`}
            >
              <Radio size={17} />
              <span>
                {connection?.message || "Connection has not been checked."}
              </span>
            </div>
            <label className="field-label">PROJECT ID</label>
            <div className="code-value">{connection?.projectId || PROJECT}</div>
            <p className="small-text">
              Configure the Factory credentials in your server environment, then
              check the connection. Without credentials, local verification is
              available but Factory submission and synchronization are blocked.
            </p>
            <div className="button-row">
              <Button
                onClick={refreshConnection}
                disabled={busy === "connection"}
              >
                <RefreshCw
                  size={15}
                  className={busy === "connection" ? "spin" : ""}
                />
                Check connection
              </Button>
              {connection?.docsUrl && (
                <Button asChild variant="outline">
                  <a href={connection.docsUrl} target="_blank" rel="noreferrer">
                    Connection guide
                    <ExternalLink size={14} />
                  </a>
                </Button>
              )}
            </div>
            {connection?.checkedAt && (
              <p className="micro-text">
                Last checked {date(connection.checkedAt)}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function NoRun({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="panel no-run">
      <Empty title="Start with a verification run">
        Your execution timeline and behavioral evidence will appear here.
        <div className="empty-action">
          <Button onClick={onCreate}>
            <Plus size={15} />
            New verification
          </Button>
        </div>
      </Empty>
    </div>
  );
}

function DashboardView({
  dashboard,
  loading,
  search,
  setSearch,
  onCreate,
  onOpen,
  busy,
}: {
  dashboard: Dashboard | null;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  onCreate: () => void;
  onOpen: (id: string, view?: View) => Promise<void>;
  busy: string | null;
}) {
  const runs =
    dashboard?.runs.filter((r) =>
      `${r.name} ${r.repository} ${r.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VERIFICATION CONTROL CENTER</div>
          <h1>
            Overview<span className="heading-dot">.</span>
          </h1>
          <p>Your code is changing. Its behavior shouldn’t.</p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} />
          New verification
        </Button>
      </div>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-badge">
            <span /> EVIDENCE, NOT PROMISES
          </span>
          <h2>
            Modernize the code.
            <br />
            <span>Keep what matters.</span>
          </h2>
          <p>
            Give your coding agent room to improve. Give your business logic an
            independent line of defense.
          </p>
          <Button onClick={onCreate}>
            Start a verification
            <ArrowRight size={16} />
          </Button>
          <div className="hero-footnote">
            <Fingerprint size={14} /> Baseline → modernization → behavioral
            evidence
          </div>
        </div>
        <div
          className="hero-diagram"
          aria-label="Independent Factory and Oracle workflows converge in verified evidence"
        >
          <div className="diagram-grid" />
          <div className="diagram-caption">
            TWO INDEPENDENT TRACKS. ONE SOURCE OF TRUTH.
          </div>
          <div className="diagram-origin">
            <Code2 size={18} />
            <span>
              Your application<small>Established behavior</small>
            </span>
            <GitBranch size={15} />
          </div>
          <div className="diagram-fork">
            <span />
            <span />
          </div>
          <div className="diagram-tracks">
            <div className="diagram-node">
              <Boxes size={19} />
              <span>
                Software Factory<small>Modernize the implementation</small>
              </span>
              <span className="diagram-number">01</span>
            </div>
            <div className="diagram-node oracle">
              <Fingerprint size={19} />
              <span>
                Independent Oracle<small>Capture behavioral invariants</small>
              </span>
              <span className="diagram-number">02</span>
            </div>
          </div>
          <div className="diagram-merge">
            <span />
            <span />
          </div>
          <div className="diagram-result">
            <ShieldCheck size={20} />
            <span>Evidence, not assumptions</span>
            <ArrowUpRight size={15} />
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          {
            label: "Verification runs",
            value: dashboard?.stats.runs,
            icon: Workflow,
            suffix: "RECENT RUNS",
          },
          {
            label: "Invariants captured",
            value: dashboard?.stats.invariants,
            icon: Fingerprint,
            suffix: "BEHAVIORAL CONTRACTS",
          },
          {
            label: "Regressions detected",
            value: dashboard?.stats.regressions,
            icon: GitCompareArrows,
            suffix: "DRIFT FINDINGS",
          },
          {
            label: "Evidence reports",
            value: dashboard?.stats.reports,
            icon: FileCheck2,
            suffix: "AUDITABLE RESULTS",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">
              {s.label}
              <s.icon size={17} />
            </div>
            <div className={`stat-value ${loading ? "skeleton-text" : ""}`}>
              {s.value ?? "—"}
            </div>
            <div className="stat-suffix">{s.suffix}</div>
          </div>
        ))}
      </div>
      <section className="panel runs-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Verification runs{" "}
              <span className="count-chip">
                {dashboard?.runs.length ?? "—"}
              </span>
            </h2>
            <p>
              A traceable journey from original behavior to verified change.
            </p>
          </div>
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search verification runs"
              placeholder="Filter runs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="search-key">⌕</span>
          </div>
        </div>
        {loading ? (
          <div className="loading-state" role="status">
            <Loader2 className="spin" size={20} />
            Loading verification runs…
          </div>
        ) : !dashboard ? (
          <Empty icon={Unplug} title="Workspace unavailable">
            We couldn’t reach the API. Use the refresh button to retry.
          </Empty>
        ) : runs.length === 0 ? (
          <Empty
            title={search ? "No matching runs" : "Your first verification starts here"}
          >
            {search ? (
              "Try another name, repository, or status."
            ) : (
              <>
                <p>
                  No runs yet. Capture a baseline, modernize with confidence,
                  <br className="desktop-break" /> and see exactly what changed.
                </p>
                <div className="empty-action">
                  <Button variant="outline" onClick={onCreate}>
                    <Plus size={15} />
                    Create your first run
                    <ArrowRight size={14} />
                  </Button>
                </div>
                <span className="empty-note">
                  Try a built-in financial fixture. No Factory credentials
                  required.
                </span>
              </>
            )}
          </Empty>
        ) : (
          <div className="runs-table">
            <div className="table-header">
              <span>RUN / REPOSITORY</span>
              <span>COMPARISON</span>
              <span>STATUS</span>
              <span>CREATED</span>
              <span />
            </div>
            {runs.map((r) => (
              <button
                className="run-row"
                key={r.id}
                onClick={() => void onOpen(r.id)}
                disabled={busy !== null}
              >
                <div className="run-name">
                  <span className="run-icon">
                    <GitCompareArrows size={18} />
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.repository.replace("https://github.com/", "")}
                    </small>
                  </span>
                </div>
                <div className="run-refs">
                  <span>{r.baselineRef}</span>
                  <ArrowRight size={12} />
                  <span>{r.targetRef}</span>
                  {r.mode !== "repository" && <small>Built-in fixture</small>}
                </div>
                <StatusBadge status={r.status} />
                <span className="table-date">{date(r.createdAt)}</span>
                {busy === `open:${r.id}` ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="trust-strip">
        <span>
          <Layers3 size={17} />
          Separation by design
        </span>
        <p>
          The agent writes the code. The oracle checks the behavior. You review
          the evidence.
        </p>
        <ShieldCheck size={20} />
      </div>
    </>
  );
}

function NewRunView({
  onCreate,
  busy,
  onBack,
  projectId,
}: {
  onCreate: (body: unknown) => Promise<void>;
  busy: boolean;
  onBack: () => void;
  projectId: string;
}) {
  const [mode, setMode] = useState<Run["mode"]>("demo-regression");
  const [repository, setRepository] = useState(REPOSITORY);
  const [baselineRef, setBaselineRef] = useState("main");
  const [targetRef, setTargetRef] = useState("controlled-regression");
  const [name, setName] = useState("Financial calculation modernization");
  const [request, setRequest] = useState(REQUEST);
  const [project, setProject] = useState(projectId);
  const [trusted, setTrusted] = useState(false);
  const chooseMode = (next: Run["mode"]) => {
    setMode(next);
    if (next !== "repository") {
      setRepository(REPOSITORY);
      setBaselineRef("main");
      setTargetRef(
        next === "demo-regression" ? "controlled-regression" : "preserved",
      );
    }
  };
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={14} />
        Back to overview
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NEW VERIFICATION</div>
          <h1>
            Change code. Not outcomes<span className="heading-dot">.</span>
          </h1>
          <p>
            Define the change. We’ll keep an independent record of the behavior.
          </p>
        </div>
        <span className="step-label">
          CONFIGURE <span>01 / 03</span>
        </span>
      </div>
      <div className="new-run-grid">
        <form
          className="panel config-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void onCreate({
              name,
              repository,
              baselineRef,
              targetRef,
              projectId: project,
              request,
              mode,
            });
          }}
        >
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2>Choose your verification path</h2>
              <p>
                Start with a built-in fixture or connect a trusted repository.
              </p>
            </div>
          </div>
          <div className="mode-options">
            {[
              {
                value: "demo-regression",
                title: "Detect a regression",
                description:
                  "Built-in financial fixture with deliberate behavioral drift.",
                icon: GitCompareArrows,
              },
              {
                value: "demo-preserved",
                title: "Verify preserved behavior",
                description:
                  "Built-in fixture with behavior-preserving modernization.",
                icon: ShieldCheck,
              },
              {
                value: "repository",
                title: "Your repository",
                description:
                  "Advanced · trusted local execution and adapter required.",
                icon: Github,
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                className={`mode-option ${mode === option.value ? "selected" : ""}`}
                onClick={() => chooseMode(option.value as Run["mode"])}
              >
                <option.icon size={20} />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="radio-circle">
                  {mode === option.value && <span />}
                </span>
              </button>
            ))}
          </div>
          <div className="form-divider" />
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <h2>Define the source</h2>
              <p>
                {mode === "repository"
                  ? "Use a repository with a compatible behavioral adapter."
                  : "Fixture labels describe local snapshots, not remote Git branches."}
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="run-name">Run name</label>
            <input
              id="run-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Name this verification"
            />
          </div>
          <div className="field">
            <label htmlFor="repository">
              Repository URL <Github size={13} />
            </label>
            <input
              id="repository"
              type="url"
              required
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              readOnly={mode !== "repository"}
            />
          </div>
          <div className="fields-row">
            <div className="field">
              <label htmlFor="baseline">
                {mode === "repository"
                  ? "Baseline ref"
                  : "Baseline fixture label"}
              </label>
              <div className="input-icon">
                <GitBranch size={14} />
                <input
                  id="baseline"
                  required
                  value={baselineRef}
                  onChange={(e) => setBaselineRef(e.target.value)}
                  readOnly={mode !== "repository"}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="target">
                {mode === "repository"
                  ? "Target ref"
                  : "Candidate fixture label"}
              </label>
              <div className="input-icon">
                <GitBranch size={14} />
                <input
                  id="target"
                  required
                  value={targetRef}
                  onChange={(e) => setTargetRef(e.target.value)}
                  readOnly={mode !== "repository"}
                />
              </div>
            </div>
          </div>
          {mode === "repository" && (
            <div className="repository-warning">
              <TriangleAlert size={18} />
              <div>
                <strong>Trusted local execution only</strong>
                <p>
                  This mode executes repository code on the server. It requires
                  server-side opt-in and a compatible Python adapter. Do not use
                  an untrusted repository.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={trusted}
                    onChange={(e) => setTrusted(e.target.checked)}
                    required
                  />
                  I trust this repository and understand the execution risk.
                </label>
              </div>
            </div>
          )}
          <div className="form-divider" />
          <div className="section-heading">
            <span className="section-number">03</span>
            <div>
              <h2>Describe the modernization</h2>
              <p>The request sent to your Software Factory work order.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="request">Change request</label>
            <textarea
              id="request"
              required
              rows={5}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <small className="field-help">
              <ShieldCheck size={13} />
              Preservation is verified independently, not inferred from this
              request.
            </small>
          </div>
          <div className="field">
            <label htmlFor="project">Factory project ID</label>
            <input
              className="mono"
              id="project"
              required
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <span>
              <Fingerprint size={14} />
              Baseline capture starts first.
            </span>
            <Button
              type="submit"
              disabled={busy || (mode === "repository" && !trusted)}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Play size={14} />
              )}
              Create verification run
              <ArrowRight size={15} />
            </Button>
          </div>
        </form>
        <aside className="run-guide">
          <div className="guide-icon">
            <ShieldCheck size={28} />
          </div>
          <div className="eyebrow">THE INVARIANT APPROACH</div>
          <h2>
            Trust the change.
            <br />
            Verify the outcome.
          </h2>
          <p>
            Two independent tracks turn modernization into an auditable
            decision.
          </p>
          <div className="guide-step">
            <span>1</span>
            <div>
              <strong>Capture the baseline</strong>
              <p>
                Discover and classify the application’s established behavioral
                contracts.
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>2</span>
            <div>
              <strong>Modernize in parallel</strong>
              <p>
                Submit a real Factory work order and hand it to your connected
                coding agent.
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>3</span>
            <div>
              <strong>Compare. Don’t assume.</strong>
              <p>
                Verify the candidate against the baseline and inspect
                reproducible counterexamples.
              </p>
            </div>
          </div>
          <div className="guide-note">
            <BookOpen size={16} />
            <p>
              Built-in fixtures run locally. Factory submission requires server
              credentials. No simulated work orders or agent launches.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Track({
  title,
  subtitle,
  icon: Icon,
  steps,
  oracle = false,
}: {
  title: string;
  subtitle: string;
  icon: typeof Boxes;
  steps: Step[];
  oracle?: boolean;
}) {
  return (
    <section
      className={`panel execution-track ${oracle ? "oracle-track" : ""}`}
    >
      <div className="track-heading">
        <div className="track-icon">
          <Icon size={22} />
        </div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="track-label">
          {oracle ? "INDEPENDENT" : "IMPLEMENTATION"}
        </span>
      </div>
      <div className="track-steps">
        {steps.length ? (
          steps.map((step, i) => (
            <div className={`track-step ${step.status}`} key={step.id}>
              <div className="step-indicator">
                {step.status === "completed" ? (
                  <Check size={14} />
                ) : step.status === "running" ? (
                  <Loader2 size={14} className="spin" />
                ) : step.status === "failed" ? (
                  <X size={14} />
                ) : step.status === "awaiting_action" ? (
                  <CircleAlert size={14} />
                ) : (
                  <span>{String(i + 1).padStart(2, "0")}</span>
                )}
              </div>
              <div className="step-content">
                <div>
                  <h3>{step.label}</h3>
                  <StatusBadge status={step.status} />
                </div>
                {step.detail && <p>{step.detail}</p>}
                {step.updatedAt && <small>{date(step.updatedAt)}</small>}
              </div>
            </div>
          ))
        ) : (
          <div className="track-empty">
            Steps will appear when the server starts this track.
          </div>
        )}
      </div>
    </section>
  );
}
function ExecutionView({
  run,
  connection,
  busy,
  onAction,
  onEvidence,
  onCopy,
  onConnect,
}: {
  run: Run;
  connection?: Connection;
  busy: string | null;
  onAction: (action: string, body?: unknown) => Promise<void>;
  onEvidence: () => void;
  onCopy: () => Promise<void>;
  onConnect: () => void;
}) {
  const [target, setTarget] = useState(run.targetRef);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [existingOrder, setExistingOrder] = useState("");
  useEffect(() => setTarget(run.targetRef), [run.id, run.targetRef]);
  const disabled = busy !== null || isActive(run);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            LIVE VERIFICATION <span className="eyebrow-divider">/</span>{" "}
            {run.id.slice(0, 8)}
          </div>
          <h1>{run.name}</h1>
          <p>Independent tracks. Shared destination. Verifiable evidence.</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="run-context">
        <span>
          <Github size={15} />
          {run.repository.replace("https://github.com/", "")}
        </span>
        <span>
          <GitBranch size={14} />
          {run.baselineRef}
          <ArrowRight size={12} />
          {run.targetRef}
        </span>
        <span className="context-mode">
          {run.mode === "repository"
            ? "Repository execution"
            : "Built-in fixtures · not remote branches"}
        </span>
      </div>
      {run.error && (
        <div className="alert error">
          <CircleAlert size={18} />
          <span>{run.error}</span>
        </div>
      )}
      {!connection?.connected && (
        <div className="alert warning">
          <Unplug size={18} />
          <span>
            <strong>Factory integration is blocked.</strong>{" "}
            {connection?.message || "Server credentials are not available."}{" "}
            Local oracle verification is independent of this connection.
          </span>
          <button className="text-button" onClick={onConnect}>
            Connection details
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="execution-banner">
        <div>
          <span className={`live-dot ${isActive(run) ? "pulse" : ""}`} />
          <span>
            {isActive(run)
              ? "Run is in progress"
              : run.status === "awaiting_action"
                ? "Ready for your next action"
                : "Execution state recorded"}
          </span>
        </div>
        <span>
          {isActive(run)
            ? "Polling the server every 2.2 seconds"
            : `Updated ${date(run.updatedAt)}`}
        </span>
      </div>
      <div className="execution-grid">
        <Track
          title="Software Factory"
          subtitle="The agent changes the implementation."
          icon={Boxes}
          steps={run.factorySteps}
        />
        <Track
          title="Behavioral Oracle"
          subtitle="The oracle independently checks the behavior."
          icon={Fingerprint}
          steps={run.oracleSteps}
          oracle
        />
      </div>
      <WorkflowGraph run={run} />
      <div className="convergence">
        <div className="convergence-lines" />
        <div className="convergence-icon">
          <ShieldCheck size={22} />
        </div>
        <div>
          <span className="eyebrow">CONVERGENCE POINT</span>
          <h3>
            {run.evidence
              ? run.evidence.verdict === "BEHAVIORAL DRIFT: DETECTED"
                ? "Behavioral drift detected"
                : run.evidence.verdict === "BEHAVIORAL INTEGRITY: VERIFIED"
                  ? "Behavioral integrity verified"
                  : "Evidence needs review"
              : "Evidence is the final authority"}
          </h3>
          <p>
            {run.evidence
              ? `${run.evidence.summary.total} checks · ${run.evidence.summary.passed} passed · ${run.evidence.summary.failed} failed`
              : "Capture the baseline, then verify the candidate to produce a comparison report."}
          </p>
        </div>
        <Button
          variant={run.evidence ? "default" : "outline"}
          onClick={onEvidence}
        >
          Inspect evidence
          <ArrowRight size={15} />
        </Button>
      </div>
      <div className="execution-actions">
        <section className="panel action-panel">
          <div className="section-heading">
            <div className="icon-tile">
              <Boxes size={19} />
            </div>
            <div>
              <h2>Implementation handoff</h2>
              <p>A real work order. An explicit agent handoff.</p>
            </div>
          </div>
          {run.workOrder ? (
            <div className="work-order">
              <span className="work-order-id">WO-{run.workOrder.number}</span>
              <strong>{run.workOrder.title}</strong>
              <span className="micro-text">{run.workOrder.status}</span>
              {run.workOrder.url && (
                <a
                  href={run.workOrder.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open work order ${run.workOrder.number}`}
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          ) : (
            <p className="action-explainer">
              Submit your modernization request to Factory. The server returns
              the actual work order, not a placeholder.
            </p>
          )}
          <div className="button-row">
            <Button
              disabled={disabled || !connection?.connected || !!run.workOrder}
              onClick={() => void onAction("submit")}
            >
              {busy === "submit" ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Plus size={14} />
              )}
              Submit work order
            </Button>
            <Button
              variant="outline"
              disabled={
                busy !== null || !connection?.connected || !run.workOrder
              }
              onClick={() => void onAction("sync")}
            >
              <RefreshCw size={14} className={busy === "sync" ? "spin" : ""} />
              Sync artifacts
            </Button>
          </div>
          {!run.workOrder && (
            <details className="existing-order">
              <summary>Already have a work order in 8090?</summary>
              <div className="field">
                <label htmlFor="existing-order">Existing work order UUID</label>
                <input id="existing-order" value={existingOrder} onChange={e => setExistingOrder(e.target.value)} placeholder="Paste the UUID from 8090" />
              </div>
              <Button variant="outline" size="sm" disabled={disabled || !connection?.connected || !existingOrder.trim()} onClick={() => void onAction("attach", { workOrderId: existingOrder.trim() })}>Associate existing work order</Button>
              <p className="micro-text">Read real context and statuses without creating a duplicate request.</p>
            </details>
          )}
          <div className="agent-handoff">
            <div>
              <Terminal size={18} />
              <span>
                <strong>Coding agent handoff</strong>
                <small>Copy the handoff into your MCP-connected agent.</small>
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!run.handoff}
              onClick={onCopy}
            >
              <Clipboard size={13} />
              Launch Coding Agent
            </Button>
          </div>
          <p className="micro-text">
            This does not automatically launch an agent.{" "}
            {connection?.docsUrl && (
              <a
                className="inline-link"
                href={connection.docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                MCP connection guide
                <ExternalLink size={11} />
              </a>
            )}
          </p>
          {run.handoff && (
            <details
              open={handoffOpen}
              onToggle={(e) => setHandoffOpen(e.currentTarget.open)}
            >
              <summary>View handoff instructions</summary>
              <pre className="handoff-code">{run.handoff}</pre>
            </details>
          )}
        </section>
        <section className="panel action-panel">
          <div className="section-heading">
            <div className="icon-tile mint">
              <GitCompareArrows size={19} />
            </div>
            <div>
              <h2>Verify the candidate</h2>
              <p>Compare outcomes against the captured baseline.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="verify-ref">
              {run.mode === "repository"
                ? "Candidate reference"
                : "Built-in candidate fixture label"}
            </label>
            <div className="input-icon">
              <GitBranch size={14} />
              <input
                id="verify-ref"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                readOnly={run.mode !== "repository"}
              />
            </div>
          </div>
          <p className="action-explainer">
            Verification evaluates behavioral invariants and records original
            values, candidate values, and counterexamples. Review
            classifications in the evidence explorer before re-verifying.
          </p>
          <Button
            disabled={disabled || !target.trim() || !run.baselinePath}
            onClick={() => void onAction("verify", { targetRef: target })}
          >
            {busy === "verify" ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Play size={14} />
            )}
            Run verification
            <ArrowRight size={14} />
          </Button>
          <div className="baseline-status">
            <Fingerprint size={14} />
            <span>
              {run.baselinePath
                ? "Baseline captured"
                : "Baseline capture must complete first"}
            </span>
          </div>
          {run.baselineCommit && (
            <div className="micro-text mono">
              Baseline commit {run.baselineCommit.slice(0, 12)}
            </div>
          )}
        </section>
      </div>
      {run.artifacts && (
        <section className="panel artifacts-panel">
          <h2>Factory artifacts</h2>
          <div className="artifact-grid">
            {Object.entries(run.artifacts).map(([key, values]) => (
              <details key={key}>
                <summary>
                  <span>
                    {(
                      {
                        requirements: "Requirements",
                        blueprints: "Blueprints",
                        workOrders: "Work orders",
                        pullRequests: "Pull requests",
                      } as Record<string, string>
                    )[key] || key}
                  </span>
                  <span className="count-chip">{values.length}</span>
                </summary>
                <pre>
                  {values.length
                    ? JSON.stringify(values, null, 2)
                    : "No artifacts synchronized yet."}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function EvidenceView({
  run,
  edits,
  setEdits,
  busy,
  onAction,
  onExecution,
}: {
  run: Run;
  edits: Record<string, Classification>;
  setEdits: React.Dispatch<
    React.SetStateAction<Record<string, Classification>>
  >;
  busy: string | null;
  onAction: (name: string, body?: unknown) => Promise<void>;
  onExecution: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [findingIds, setFindingIds] = useState<string[]>([]);
  const [existingRemediation, setExistingRemediation] = useState("");
  const evidence = run.evidence;
  useEffect(() => {
    setSelected(null);
    setFindingIds([]);
  }, [run.id]);
  if (!evidence)
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">EVIDENCE EXPLORER</div>
            <h1>
              Evidence takes precedence<span className="heading-dot">.</span>
            </h1>
            <p>{run.name}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
        <div className="panel">
          <Empty
            icon={FileCheck2}
            title={
              isActive(run)
                ? "Evidence is being collected"
                : "No comparison report yet"
            }
          >
            <p>
              {isActive(run)
                ? "This page updates automatically as the server captures and verifies behavior."
                : "Return to execution to capture the baseline and verify the candidate."}
            </p>
            <div className="empty-action">
              <Button variant="outline" onClick={onExecution}>
                <ArrowLeft size={15} />
                View execution
              </Button>
            </div>
          </Empty>
        </div>
      </>
    );
  const drift = evidence.verdict === "BEHAVIORAL DRIFT: DETECTED";
  const verified = evidence.verdict === "BEHAVIORAL INTEGRITY: VERIFIED";
  const invariants = evidence.invariants.filter(
    (inv) =>
      (!query ||
        `${inv.title} ${inv.category} ${inv.description}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "ALL" || (edits[inv.id] || inv.classification) === filter),
  );
  const active = invariants.find((inv) => inv.id === selected) || invariants[0];
  const findings = evidence.findings.filter(
    (f) => f.invariantId === active?.id,
  );
  const changes = Object.keys(edits).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            EVIDENCE EXPLORER <span className="eyebrow-divider">/</span>{" "}
            {run.id.slice(0, 8)}
          </div>
          <h1>
            The behavior tells the story<span className="heading-dot">.</span>
          </h1>
          <p>{run.name}</p>
        </div>
        <div className="button-row">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/runs/${run.id}/report?format=json`} download>
              <ArrowDownToLine size={14} />
              JSON
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/runs/${run.id}/report?format=markdown`} download>
              <ArrowDownToLine size={14} />
              Markdown
            </a>
          </Button>
        </div>
      </div>
      <section
        className={`verdict-banner ${drift ? "drift" : verified ? "verified" : "review"}`}
      >
        <div className="verdict-icon">
          {drift ? (
            <GitCompareArrows size={27} />
          ) : verified ? (
            <ShieldCheck size={29} />
          ) : (
            <CircleAlert size={28} />
          )}
        </div>
        <div>
          <div className="eyebrow">INDEPENDENT ORACLE VERDICT</div>
          <h2>{evidence.verdict}</h2>
          <p>
            {drift
              ? "The candidate diverges from established behavior. Inspect the counterexamples before accepting the change."
              : verified
                ? "The candidate preserved the tested behavioral contracts. Review the methodology and coverage limitations below."
                : "Classification or verification needs review before behavioral preservation can be confirmed."}
          </p>
        </div>
        <div className="verdict-stats">
          <strong>
            {evidence.summary.passed}
            <span> / {evidence.summary.total}</span>
          </strong>
          <small>CHECKS PASSED</small>
        </div>
      </section>
      <div className="evidence-summary">
        <span>
          <CheckCircle2 size={14} />
          <strong>{evidence.summary.passed}</strong> passed
        </span>
        <span className={evidence.summary.failed ? "danger-text" : ""}>
          <CircleAlert size={14} />
          <strong>{evidence.summary.failed}</strong> failed
        </span>
        <span>
          <Activity size={14} />
          {(evidence.summary.durationMs / 1000).toFixed(2)}s duration
        </span>
        <span>
          <GitCompareArrows size={14} />
          {evidence.findings.length} findings
        </span>
        <span className="summary-timestamp">
          Generated {date(evidence.generatedAt)}
        </span>
      </div>
      <section className="panel explorer">
        <div className="panel-heading">
          <div>
            <h2>
              Behavioral invariants{" "}
              <span className="count-chip">{evidence.invariants.length}</span>
            </h2>
            <p>Inspect the contract. Decide what must stay the same.</p>
          </div>
          <div className="explorer-controls">
            <div className="search-field">
              <Search size={14} />
              <input
                aria-label="Search invariants"
                placeholder="Find an invariant…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter classifications"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">All classifications</option>
              {classifications.map((c) => (
                <option key={c} value={c}>
                  {classificationLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="explorer-body">
          <div className="invariant-list">
            {invariants.length ? (
              invariants.map((inv) => {
                const count = evidence.findings.filter(
                  (f) => f.invariantId === inv.id,
                ).length;
                return (
                  <button
                    key={inv.id}
                    className={`invariant-item ${active?.id === inv.id ? "selected" : ""}`}
                    onClick={() => setSelected(inv.id)}
                  >
                    <div className="invariant-item-top">
                      <span className="invariant-category">{inv.category}</span>
                      {count > 0 ? (
                        <span className="finding-count">
                          {count} finding{count > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="invariant-state">
                          {inv.status || "Captured"}
                        </span>
                      )}
                    </div>
                    <strong>{inv.title}</strong>
                    <span
                      className={`classification-chip ${(edits[inv.id] || inv.classification).toLowerCase()}`}
                    >
                      {classificationLabel(edits[inv.id] || inv.classification)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="list-empty">No invariants match this filter.</div>
            )}
          </div>
          <div className="invariant-detail">
            {active ? (
              <>
                <div className="detail-heading">
                  <span className="eyebrow">
                    {active.category} <span className="eyebrow-divider">/</span>{" "}
                    {active.id}
                  </span>
                  <h2>{active.title}</h2>
                  <p>{active.description}</p>
                </div>
                <div className="classification-field">
                  <div>
                    <label htmlFor="classification">
                      Behavioral classification
                    </label>
                    <p>
                      Intentional changes are reviewed separately from
                      preservation failures.
                    </p>
                  </div>
                  <select
                    id="classification"
                    value={edits[active.id] || active.classification}
                    onChange={(e) =>
                      setEdits((previous) => ({
                        ...previous,
                        [active.id]: e.target.value as Classification,
                      }))
                    }
                  >
                    {classifications.map((c) => (
                      <option key={c} value={c}>
                        {classificationLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                {active.source && (
                  <div className="source-line">
                    <Code2 size={14} />
                    <code>
                      {active.source.file}:{active.source.line}
                    </code>
                    {active.tests !== undefined && (
                      <span>{active.tests} tests</span>
                    )}
                  </div>
                )}
                {findings.length ? (
                  <div className="findings">
                    <div className="findings-heading">
                      <h3>Counterexamples</h3>
                      <span>OBSERVED VALUES · NOT ESTIMATES</span>
                    </div>
                    {findings.map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        selected={findingIds.includes(finding.id)}
                        toggle={() =>
                          setFindingIds((ids) =>
                            ids.includes(finding.id)
                              ? ids.filter((id) => id !== finding.id)
                              : [...ids, finding.id],
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="no-findings">
                    <ShieldCheck size={22} />
                    <div>
                      <strong>No counterexample recorded</strong>
                      <p>
                        No finding was reported for this invariant in the
                        current evidence. This is not a claim of exhaustive
                        correctness.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Empty title="No invariants recorded">
                The report did not contain behavioral contracts.
              </Empty>
            )}
          </div>
        </div>
        <div className="explorer-footer">
          <span>
            {changes
              ? `${changes} classification change${changes > 1 ? "s" : ""} not yet verified`
              : "Classifications reflect the current report"}
          </span>
          <Button
            size="sm"
            variant={changes ? "default" : "outline"}
            disabled={busy !== null || isActive(run)}
            onClick={() =>
              void onAction("verify", {
                targetRef: run.targetRef,
                classifications: edits,
              })
            }
          >
            {busy === "verify" ? (
              <Loader2 className="spin" size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            {changes ? "Apply & re-verify" : "Re-run verification"}
          </Button>
        </div>
      </section>
      {evidence.findings.length > 0 && (
        <section className="panel remediation-panel">
          <div className="icon-tile">
            <Workflow size={22} />
          </div>
          <div>
            <h2>Turn findings into focused work</h2>
            <p>
              Select counterexamples to create real remediation work orders in
              Software Factory.
            </p>
          </div>
          <Button
            disabled={!findingIds.length || busy !== null}
            onClick={() => void onAction("remediate", { findingIds, ...(existingRemediation.trim() ? { workOrderId: existingRemediation.trim() } : {}) })}
          >
            {busy === "remediate" ? (
              <Loader2 className="spin" size={14} />
            ) : (
              <Plus size={14} />
            )}
            {existingRemediation.trim() ? "Associate remediation" : "Create remediation"}
            {findingIds.length > 0 && (
              <span className="button-count">{findingIds.length}</span>
            )}
          </Button>
        </section>
      )}
      {evidence.findings.length > 0 && (
        <div className="field existing-remediation-field"><label htmlFor="existing-remediation">Existing remediation work order UUID (optional)</label><input id="existing-remediation" placeholder="Leave empty to create a new 8090 work order" value={existingRemediation} onChange={e => setExistingRemediation(e.target.value)} /><p className="micro-text">Associate an existing correction without creating duplicate work. Select the measured findings above.</p></div>
      )}
      {!!run.remediations?.length && <section className="panel remediation-history"><h2>Remediation history</h2>{run.remediations.map(rem => <div key={rem.workOrder.id}><a className="inline-link" href={rem.workOrder.url} target="_blank" rel="noreferrer">WO-{rem.workOrder.number} · {rem.workOrder.title}</a><span>{rem.workOrder.status}</span><p>{rem.resolvedAt ? `Independent full-suite correction verified at ${date(rem.resolvedAt)} against ${rem.lastVerifiedCandidate?.slice(0, 12)}. No merge or approval performed.` : "Correction awaits independent re-verification of the target commit."}</p></div>)}</section>}
      <div className="report-notes-grid">
        <section className="panel report-notes">
          <h2>
            <Fingerprint size={18} />
            Methodology & scope
          </h2>
          <ul>
            {evidence.methodology.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <h3>Limitations</h3>
          <ul className="limitations">
            {evidence.limitations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="panel report-notes">
          <h2>
            <GitBranch size={18} />
            Snapshot provenance
          </h2>
          <Snapshot label="BASELINE" snapshot={evidence.baseline} />
          <Snapshot label="CANDIDATE" snapshot={evidence.candidate} />
          <div className="provenance-note">
            <ShieldCheck size={14} />
            Content hashes identify the actual verified snapshots.
          </div>
        </section>
      </div>
    </>
  );
}
function Snapshot({
  label,
  snapshot,
}: {
  label: string;
  snapshot: Evidence["baseline"];
}) {
  return (
    <div className="snapshot">
      <span className="field-label">{label}</span>
      <strong>
        <GitBranch size={13} />
        {snapshot.ref}
      </strong>
      <code title={snapshot.sha256}>{snapshot.sha256}</code>
      <span className="snapshot-path">{snapshot.path}</span>
    </div>
  );
}
function FindingCard({
  finding,
  selected,
  toggle,
}: {
  finding: Finding;
  selected: boolean;
  toggle: () => void;
}) {
  return (
    <article className="finding-card">
      <div className="finding-heading">
        <label className="finding-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={toggle}
            aria-label={`Select ${finding.title} for remediation`}
          />
          <strong>{finding.title}</strong>
        </label>
        <span className={`severity ${finding.severity}`}>
          {finding.severity}
        </span>
      </div>
      <div className="finding-tags">
        <span>{classificationLabel(finding.classification)}</span>
        {finding.minimal && <span>Minimized counterexample</span>}
      </div>
      <div className="numeric-comparison">
        <div>
          <span>ORIGINAL / BASELINE</span>
          <pre>{valueText(finding.original)}</pre>
        </div>
        <div className="comparison-arrow">
          <ArrowRight size={16} />
        </div>
        <div>
          <span>NEW / CANDIDATE</span>
          <pre>{valueText(finding.candidate)}</pre>
        </div>
      </div>
      <details className="counterexample" open>
        <summary>
          <Terminal size={13} />
          Counterexample input
        </summary>
        <pre>{JSON.stringify(finding.input, null, 2)}</pre>
      </details>
      {finding.sourceLocations.length > 0 && (
        <div className="finding-sources">
          {finding.sourceLocations.map((location, i) => (
            <span key={i}>
              <Code2 size={12} />
              <code>
                {location.file}:{location.line}
              </code>
            </span>
          ))}
        </div>
      )}
      <div className="recommendation">
        <Sparkles size={14} />
        <div>
          <strong>Recommendation</strong>
          <p>{finding.recommendation}</p>
        </div>
      </div>
      {finding.remediationWorkOrder && (
        <div className="remediation-link">
          <CheckCircle2 size={14} />
          Remediation created:{" "}
          {finding.remediationWorkOrder.url ? (
            <a
              href={finding.remediationWorkOrder.url}
              target="_blank"
              rel="noreferrer"
            >
              WO-{finding.remediationWorkOrder.number}
              <ExternalLink size={12} />
            </a>
          ) : (
            <span>WO-{finding.remediationWorkOrder.number}</span>
          )}
          <span>{finding.remediationWorkOrder.status}</span>
        </div>
      )}
    </article>
  );
}

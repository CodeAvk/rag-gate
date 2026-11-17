import { loadDashboard, runKey, type RunRecord, type Status, type Summary } from "../lib/data";
import { METRIC_LABELS, parseMetric } from "../lib/trend";
import { TrendChart } from "./trend-chart";

// Read the run store on every request, so a new eval run shows up on refresh.
export const dynamic = "force-dynamic";

const fmt = (x: number | undefined) => (x === undefined ? "–" : x.toFixed(3));
const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

function StatusBadge({ status }: { status: Status }) {
  const cls = { pass: "ok", regression: "bad", "no baseline": "muted", "dataset changed": "warn" }[status];
  return <span className={`badge ${cls}`}>{status}</span>;
}

function MetricsTable({ summary }: { summary: Record<string, Summary> }) {
  return (
    <table className="metrics">
      <thead>
        <tr><th>questions</th><th>n</th><th>R@1</th><th>R@5</th><th>MRR</th></tr>
      </thead>
      <tbody>
        {Object.entries(summary).map(([group, s]) => (
          <tr key={group}>
            <td>{group}</td><td className="num">{s.questions}</td>
            <td className="num">{fmt(s.recallAt1)}</td><td className="num">{fmt(s.recallAt5)}</td><td className="num">{fmt(s.mrr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BaselineCard({ b }: { b: RunRecord }) {
  return (
    <article className="card">
      <h3>{b.config.retriever} <span className="dim">on {b.datasetVersion}, {b.config.split}</span></h3>
      <p className="meta">
        commit <code>{b.commit ?? "unknown"}</code> · saved {when(b.createdAt)} · dataset <code>{b.datasetHash}</code>
      </p>
      <MetricsTable summary={b.summary} />
    </article>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const metric = parseMetric((await searchParams).metric);
  const data = loadDashboard();
  const counts = data.runs.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  return (
    <main>
      <header>
        <h1>RAG Gate</h1>
        <p className="lede">
          Retrieval quality runs and the baselines CI gates against. Synthetic test data only.
        </p>
      </header>

      <section>
        <h2>Baselines <span className="dim">({data.baselines.length}, committed in <code>baselines/</code>)</span></h2>
        {data.baselines.length === 0 ? (
          <p className="empty">No baselines yet. Save one with <code>npm run eval -- --save-baseline</code>.</p>
        ) : (
          <div className="grid">{data.baselines.map((b) => <BaselineCard key={runKey(b)} b={b} />)}</div>
        )}
      </section>

      <section>
        <h2>Score trend <span className="dim">({METRIC_LABELS[metric]} per run, one panel per config; hover a point for its run)</span></h2>
        <TrendChart runs={data.runs.map((r) => r.run)} baselines={data.baselines} metric={metric} />
      </section>

      <section>
        <h2>
          Run history <span className="dim">({data.runs.length} runs
          {Object.entries(counts).map(([s, n]) => ` · ${n} ${s}`).join("")})</span>
        </h2>
        {!data.historyFound ? (
          <p className="empty">
            No local run history at <code>data/runs/runs.jsonl</code>. It is git-ignored, so a fresh clone starts
            empty: run <code>npm run eval</code> in the repository root.
          </p>
        ) : (
          <div className="scroll">
            <table className="history">
              <thead>
                <tr>
                  <th>time</th><th>retriever</th><th>dataset</th><th>commit</th>
                  <th>R@1</th><th>R@5</th><th>MRR</th><th>paraphrase R@1</th><th>vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map(({ run, status, regressions }) => (
                  <tr key={run.id}>
                    <td className="nowrap">{when(run.createdAt)}</td>
                    <td><code>{run.config.retriever}</code></td>
                    <td className="nowrap">{run.datasetVersion} {run.config.split}{run.config.seed !== 1 && <span className="dim"> · seed {run.config.seed}</span>}</td>
                    <td><code>{run.commit ?? "–"}</code></td>
                    <td className="num">{fmt(run.summary.all?.recallAt1)}</td>
                    <td className="num">{fmt(run.summary.all?.recallAt5)}</td>
                    <td className="num">{fmt(run.summary.all?.mrr)}</td>
                    <td className="num">{fmt(run.summary.paraphrase?.recallAt1)}</td>
                    <td>
                      <StatusBadge status={status} />
                      {regressions.length > 0 && <div className="why">{regressions.join("; ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>
        Reads <code>baselines/</code> and <code>data/runs/runs.jsonl</code> from the repository root. Portfolio project;
        demand not validated.
      </footer>
    </main>
  );
}

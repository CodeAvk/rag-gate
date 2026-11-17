import Link from "next/link";
import type { RunRecord } from "../lib/data";
import {
  buildTrends, latest, METRIC_LABELS, SERIES, timeDomain, xScale, yScale,
  type Metric, type TrendPanel,
} from "../lib/trend";

// Panel geometry in SVG units; the SVG scales to the card width.
const W = 320, H = 140, L = 34, R = 10, T = 10, B = 24;
const day = (t: number) => new Date(t).toISOString().slice(5, 10);
const fmt = (v: number) => v.toFixed(3);
const signed = (d: number) => (Math.abs(d) < 5e-4 ? "±0.000" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`);

function Panel({ panel, domain, metric }: { panel: TrendPanel; domain: [number, number]; metric: Metric }) {
  const x = xScale(domain, L, W - R);
  const y = yScale(T, H - B);
  return (
    <figure className="card trend-panel">
      <figcaption>
        <h3>{panel.retriever} <span className="dim">on {panel.dataset}</span></h3>
        <ul className="trend-latest">
          {SERIES.map(({ group, label }, i) => {
            const last = latest(panel, group);
            if (!last) return null;
            return (
              <li key={group}>
                <span className={`key s${i + 1}`} aria-hidden="true" />
                {label} <b>{fmt(last.value)}</b>
                <span className="dim">
                  {last.delta === null ? " · no baseline" : ` · ${signed(last.delta)} vs baseline`}
                </span>
              </li>
            );
          })}
        </ul>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${METRIC_LABELS[metric]} over time for ${panel.retriever} on ${panel.dataset}`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="gridline" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="tick" x={L - 6} y={y(v)} dy="0.32em" textAnchor="end">{v.toFixed(1)}</text>
          </g>
        ))}
        <text className="tick" x={L} y={H - 6} textAnchor="start">{day(domain[0])}</text>
        {domain[1] !== domain[0] && <text className="tick" x={W - R} y={H - 6} textAnchor="end">{day(domain[1])}</text>}

        {SERIES.map(({ group }, i) => {
          const b = panel.baseline?.[group];
          return b === undefined ? null : (
            <line key={`b-${group}`} className={`baseline s${i + 1}`} x1={L} x2={W - R} y1={y(b)} y2={y(b)} />
          );
        })}

        {SERIES.map(({ group, label }, i) => {
          const pts = panel.points.filter((p) => p.values[group] !== undefined);
          const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.values[group]!).toFixed(1)}`).join("");
          return (
            <g key={group} className={`series s${i + 1}`}>
              {pts.length > 1 && <path d={d} />}
              {pts.map((p) => (
                <g key={p.runId} className="pt">
                  <circle className="hit" cx={x(p.t)} cy={y(p.values[group]!)} r={9} />
                  <circle className="dot" cx={x(p.t)} cy={y(p.values[group]!)} r={4} />
                  <title>{`${label}: ${METRIC_LABELS[metric]} ${fmt(p.values[group]!)}\n${new Date(p.t).toISOString().replace("T", " ").slice(0, 16)} UTC · commit ${p.commit ?? "unknown"}`}</title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function TrendChart({ runs, baselines, metric }: { runs: RunRecord[]; baselines: RunRecord[]; metric: Metric }) {
  const panels = buildTrends(runs, baselines, metric);
  const domain = timeDomain(panels);
  return (
    <>
      <div className="trend-controls">
        <nav aria-label="Metric" className="seg">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <Link key={m} href={m === "recallAt1" ? "/" : `/?metric=${m}`} aria-current={m === metric ? "true" : undefined} scroll={false}>
              {METRIC_LABELS[m]}
            </Link>
          ))}
        </nav>
        <ul className="legend">
          {SERIES.map(({ group, label }, i) => (
            <li key={group}><span className={`key s${i + 1}`} aria-hidden="true" />{label}</li>
          ))}
          <li><span className="key baseline-key" aria-hidden="true" />committed baseline</li>
        </ul>
      </div>
      {panels.length === 0 || domain === null ? (
        <p className="empty">No runs yet, so there is nothing to plot. Run <code>npm run eval</code> in the repository root.</p>
      ) : (
        <div className="grid trend-grid">
          {panels.map((p) => <Panel key={p.key} panel={p} domain={domain} metric={metric} />)}
        </div>
      )}
    </>
  );
}

import { headline, loadAnswerReports, outcomeOf, type AnswerReport, type AnswerRow, type Outcome, type Verdict } from "../../lib/answers";
import { repoRoot } from "../../lib/data";

// Read the reports on every request, so a new `npm run answer` shows up on refresh.
export const dynamic = "force-dynamic";

const when = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cls = { supported: "ok", unsupported: "bad", abstained: "muted" }[verdict];
  return <span className={`badge ${cls}`}>{verdict}</span>;
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const cls = { correct: "ok", wrong: "bad", abstained: "muted" }[outcome];
  return <span className={`badge ${cls}`}>{outcome}</span>;
}

function Ids({ ids, gold }: { ids: string[]; gold: string }) {
  if (ids.length === 0) return <span className="dim">no citations</span>;
  return (
    <>
      {ids.map((id) => (
        <code key={id} className={id === gold ? "gold" : undefined} title={id === gold ? "gold passage" : undefined}>{id}</code>
      ))}
    </>
  );
}

function Row({ r }: { r: AnswerRow }) {
  return (
    <tr>
      <td>
        <div>{r.question}</div>
        <div className="meta">{r.style} · expected <code>{r.expected}</code></div>
      </td>
      <td>
        {r.answer === null ? <span className="dim">no answer</span> : r.answer}
        <div className="ids"><Ids ids={r.citations} gold={r.gold} /></div>
      </td>
      <td>
        <VerdictBadge verdict={r.verdict} />
        {r.reasons.length > 0 && <ul className="reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      </td>
      <td><OutcomeBadge outcome={outcomeOf(r)} /></td>
      <td className="dim">{r.goldRetrieved ? "yes" : "no"}{r.cached ? " · cached" : ""}</td>
    </tr>
  );
}

function Report({ rep }: { rep: AnswerReport }) {
  const h = headline(rep.totals);
  const t = rep.totals;
  return (
    <article className="card report">
      <h3>
        {rep.retriever} <span className="dim">on {rep.corpus}, {rep.model}{rep.dropGold && ", gold passage hidden"}</span>
      </h3>
      <p className="meta"><code>{rep.file}</code> · written {when(rep.writtenAt)}</p>
      <div className="tiles">
        <div className="tile"><b>{h.correct}</b><span>shown and correct</span></div>
        <div className={`tile ${h.wrong > 0 ? "bad" : ""}`}><b>{h.wrong}</b><span>shown and wrong</span></div>
        <div className="tile"><b>{h.abstained}</b><span>abstained</span></div>
        <div className="tile"><b>{t.rawCorrect}/{t.questions}</b><span>model correct before the check</span></div>
        <div className="tile"><b>{t.unsupported}</b><span>blocked by the check</span></div>
      </div>
      {Object.keys(rep.selfTest).length > 0 && (
        <p className="meta">
          Check self-test on deliberately broken copies:{" "}
          {Object.entries(rep.selfTest).map(([k, s]) => `${k} ${s.caught}/${s.tried}`).join(" · ")}
        </p>
      )}
      <div className="scroll">
        <table className="answers">
          <thead>
            <tr><th>question</th><th>model answer and citations</th><th>citation check</th><th>shown</th><th>gold retrieved</th></tr>
          </thead>
          <tbody>{rep.rows.map((r) => <Row key={r.id} r={r} />)}</tbody>
        </table>
      </div>
    </article>
  );
}

export default function AnswersPage() {
  const reports = loadAnswerReports(repoRoot());
  return (
    <main>
      <header>
        <h1>Grounded answers</h1>
        <p className="lede">
          Each Gemini answer is checked against the passages it cites before it is shown. If the check fails, the reader
          sees an abstention instead. Synthetic questions only.
        </p>
      </header>
      <section>
        <h2>Reports <span className="dim">({reports.length}, from <code>data/answers/</code>)</span></h2>
        {reports.length === 0 ? (
          <p className="empty">
            No answer reports yet. They are git-ignored, so a fresh clone starts empty: run{" "}
            <code>npm run answer -- --corpus v2 --retriever gemini+product --limit 6</code> in the repository root. It
            needs a Gemini API key, and each new question uses one request of the daily cap.
          </p>
        ) : (
          reports.map((rep) => <Report key={rep.file} rep={rep} />)
        )}
      </section>
      <footer>
        Reads <code>data/answers/*.json</code> from the repository root. Portfolio project; demand not validated.
      </footer>
    </main>
  );
}

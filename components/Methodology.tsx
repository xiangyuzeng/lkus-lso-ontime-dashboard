import type { Payload } from '@/lib/types';
import { palette, radius, shadow, space } from '@/lib/tokens';

// "How these numbers are calculated" — plain-English methodology notes shown
// on the board itself so readers can interpret the rates without the README.
// Definitions that can change (the denominators) are read straight from the
// payload so the notes never drift from the pipeline.
export function Methodology({ payload }: { payload: Payload }) {
  const notes = payload.meta.data_notes ?? {};
  const anomalies = (notes.lso100_anomalies || 0) + (notes.lso200_anomalies || 0);
  const dd = payload.meta.denominator_def ?? {};
  const d100 = dd['LSO100'] ?? 'store roster ∪ LSO100 completers';
  const d200 = dd['LSO200'] ?? 'LSO100 completers ∪ LSO200 completers';

  return (
    <section
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.sm,
        padding: space.xl,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: palette.navy }} />
      <h2 style={{ margin: `0 0 ${space.xs}`, fontSize: '16px', color: palette.navy }}>How these numbers are calculated</h2>
      <p style={{ margin: `0 0 ${space.lg}`, color: palette.textMuted, fontSize: '13px', lineHeight: 1.6 }}>
        Each rate is <strong>on-time completions ÷ everyone who entered that level’s training</strong>, computed per employee
        from read-only HR + attendance data (tenant LKUS), then rolled up by region and overall.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: space.md }}>
        <Block
          title="LSO100 — on time"
          formula="Σ effective work-hours (hire → cert) ≤ 112 h"
          body="Actual clocked effective-hours are summed from the hire date to the certification date; on-time means the cert was earned within the first 112 worked hours."
        />
        <Block
          title="LSO200 — on time"
          formula="elapsed calendar days (hire → cert) ≤ 45 days"
          body="Measured as wall-clock days from the hire date to the LSO200 acquisition date."
        />
        <Block
          title="Entered — LSO100 denominator"
          formula={d100}
          body="Everyone who entered the LSO100 pipeline — whether they finished or are still working toward it."
        />
        <Block
          title="Entered — LSO200 denominator"
          formula={d200}
          body="The pool eligible for / advancing to LSO200."
        />
        <Block
          title="In progress"
          formula="entered − completed"
          body="In-progress training isn’t recorded upstream for LKUS, so it’s inferred as the entered pool minus those who already earned the cert."
        />
      </div>

      <ul style={{ margin: `${space.lg} 0 0`, paddingLeft: '18px', color: palette.textMuted, fontSize: '12px', lineHeight: 1.75 }}>
        <li>
          <strong>Sources:</strong> certification dates from the HR qualification ledger (Yunxuetang LMS); worked hours from
          the attendance system; roster + hire dates from iEHR. All read-only.
        </li>
        <li>
          <strong>Regions:</strong> shown as <em>Pending</em> until a store→region map is published — no region is guessed.
        </li>
        <li>
          <strong>Excluded:</strong> {anomalies} cert{anomalies === 1 ? '' : 's'} earned before the hire date or with no hire
          date are left out of the on-time count (data anomalies), but still counted as completed.
        </li>
        <li>
          <strong>Refresh:</strong> recomputed from source at least daily. The header badge shows data age; a “seed” chip
          means the live pipeline hasn’t published yet.
        </li>
      </ul>
    </section>
  );
}

function Block({ title, formula, body }: { title: string; formula: string; body: string }) {
  return (
    <div style={{ background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: radius.md, padding: '12px 14px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: palette.text }}>{title}</div>
      <div
        style={{
          margin: '6px 0',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '12px',
          color: palette.blue,
          background: 'rgba(74,144,217,0.10)',
          borderRadius: radius.sm,
          padding: '5px 8px',
          wordBreak: 'break-word',
        }}
      >
        {formula}
      </div>
      <div style={{ fontSize: '12px', color: palette.textMuted, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

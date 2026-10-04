'use client';

import { formatUnits } from 'viem';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTime, formatWad } from '@velanos/ui';
import type { NavSeries } from '@/lib/api';

/**
 * NAV per share against its high-water mark and its floor.
 *
 * The floor is drawn as a filled band rather than a line, because the question a depositor is asking
 * is not "where is the floor" but "am I below it". A band makes a breach a visible area rather than a
 * crossing you have to squint at — and it is the moment the bond gets spent, so it should be the most
 * legible thing on the chart.
 *
 * Slashes and market shocks are marked on the time axis. Without them the line just dips and a judge
 * has to take our word for why.
 */
export function NavChart({ series, height = 280 }: { series: NavSeries; height?: number }) {
  const points = series.points.map((p) => ({
    ts: p.ts,
    pps: Number(formatUnits(BigInt(p.pricePerShareWad), 18)),
    hwm: Number(formatUnits(BigInt(p.hwmWad), 18)),
    floor: Number(formatUnits(BigInt(p.floorWad), 18)),
  }));

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] text-sm text-[var(--ink-3)]"
        style={{ height }}
      >
        Collecting NAV snapshots…
      </div>
    );
  }

  const floor = points.at(-1)!.floor;
  const values = points.flatMap((p) => [p.pps, p.hwm, p.floor]);
  // Pad the domain so the floor band is never flush against the axis.
  const min = Math.min(...values) * 0.985;
  const max = Math.max(...values) * 1.01;

  const nearest = (ts: number) =>
    points.reduce((a, b) => (Math.abs(b.ts - ts) < Math.abs(a.ts - ts) ? b : a));

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 22, bottom: 0, left: -12 }}>
            <defs>
              {/* Fades out quickly: a fill that reaches the axis reads as a solid block and collides
                with the floor band underneath it. */}
              <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity={0.14} />
                <stop offset="55%" stopColor="var(--green)" stopOpacity={0.03} />
                <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
            <XAxis
              dataKey="ts"
              tickFormatter={(ts: number) => formatTime(ts)}
              stroke="var(--ink-3)"
              tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              minTickGap={48}
            />
            <YAxis
              domain={[min, max]}
              tickFormatter={(v: number) => v.toFixed(3)}
              stroke="var(--ink-3)"
              tick={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              width={64}
            />

            {/* Everything below the floor is the region the bond is responsible for. */}
            <ReferenceArea y1={min} y2={floor} fill="var(--loss)" fillOpacity={0.045} />

            <Line
              type="monotone"
              dataKey="floor"
              stroke="var(--loss)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Loss floor"
            />
            <Line
              type="monotone"
              dataKey="hwm"
              stroke="var(--ink)"
              strokeWidth={1}
              strokeDasharray="2 3"
              dot={false}
              name="High-water mark"
            />
            <Area type="monotone" dataKey="pps" stroke="none" fill="url(#navFill)" />
            <Line
              type="monotone"
              dataKey="pps"
              stroke="var(--green)"
              strokeWidth={2}
              dot={false}
              name="NAV per share"
            />

            {series.markers.shocks.map((s) => {
              const p = nearest(s.ts);
              return (
                <ReferenceDot
                  key={`shock-${s.ts}-${s.symbol}`}
                  x={p.ts}
                  y={p.pps}
                  r={5}
                  fill="var(--ink)"
                  stroke="var(--bg)"
                  strokeWidth={1.5}
                />
              );
            })}
            {series.markers.slashes.map((s, i) => {
              const p = nearest(s.ts);
              return (
                <ReferenceDot
                  key={`slash-${s.ts}-${i}`}
                  x={p.ts}
                  y={p.pps}
                  r={5}
                  fill="var(--loss)"
                  stroke="var(--bg)"
                  strokeWidth={1.5}
                />
              );
            })}

            <Tooltip
              contentStyle={{
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line-strong)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
              labelFormatter={(ts) => formatTime(Number(ts))}
              formatter={(value, name) => [Number(value ?? 0).toFixed(4), name]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <Legend floor={floor} />
    </div>
  );
}

function Legend({ floor }: { floor: number }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[var(--ink-3)]">
      <Item color="var(--green)" label="NAV per share" />
      <Item color="var(--ink)" label="High-water mark" dashed />
      <Item color="var(--loss)" label={`Loss floor ${floor.toFixed(4)}`} dashed />
      <Item color="var(--loss)" label="Slash" dot />
    </div>
  );
}

function Item({
  color,
  label,
  dashed,
  dot,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  dot?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dot ? (
        <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      ) : (
        <span
          className="h-0 w-4"
          style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export { formatWad };

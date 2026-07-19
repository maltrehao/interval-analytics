"use client";

import { useState } from "react";
import type { PricePoint, RollingHorizonId, RollingWinRate } from "./analytics";

export type ChartTheme = "ocean" | "midnight" | "rose";
export type ChartLineWidth = "fine" | "standard" | "bold";

export type ChartSettings = {
  theme: ChartTheme;
  lineWidth: ChartLineWidth;
  showBenchmark: boolean;
  showGrid: boolean;
  showArea: boolean;
};

export const chartThemeLabels: Record<ChartTheme, string> = {
  ocean: "远海蓝",
  midnight: "深夜墨",
  rose: "胭脂红",
};

const widthValue: Record<ChartLineWidth, number> = { fine: 1.6, standard: 2.4, bold: 3.4 };

export function PerformanceChart({ primary, benchmark, peers, primaryLabel, benchmarkLabel, settings }: {
  primary: PricePoint[];
  benchmark: PricePoint[];
  peers: { label: string; series: PricePoint[] }[];
  primaryLabel: string;
  benchmarkLabel: string;
  settings: ChartSettings;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const normalize = (items: PricePoint[]) => items.length ? items.map((point) => ({ date: point.date, value: point.value / items[0].value })) : [];
  const normalized = normalize(primary);
  const benchmarkNormalized = settings.showBenchmark ? normalize(benchmark) : [];
  const peerNormalized = peers.map((peer) => ({ ...peer, series: normalize(peer.series) })).filter((peer) => peer.series.length);
  const allValues = [...normalized, ...benchmarkNormalized, ...peerNormalized.flatMap((peer) => peer.series)].map((point) => point.value);
  const min = Math.min(...allValues, 1) - Math.max(.015, (Math.max(...allValues, 1) - Math.min(...allValues, 1)) * .08);
  const max = Math.max(...allValues, 1) + Math.max(.015, (Math.max(...allValues, 1) - Math.min(...allValues, 1)) * .08);
  const width = 1040, height = 420, left = 64, right = 24, top = 26, bottom = 46;
  const x = (index: number, length = normalized.length) => left + (index / Math.max(1, length - 1)) * (width - left - right);
  const y = (value: number) => top + ((max - value) / Math.max(0.0001, max - min)) * (height - top - bottom);
  const points = (items: { value: number }[]) => items.map((point, index) => `${x(index, items.length)},${y(point.value)}`).join(" ");
  const area = `${left},${y(1)} ${points(normalized)} ${width - right},${y(1)}`;
  const tickIndexes = Array.from({ length: 6 }, (_, index) => Math.round((index / 5) * (normalized.length - 1)));
  const lineWidth = widthValue[settings.lineWidth];
  return <svg className={`chart chart-theme-${settings.theme}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标的、复合基准与同类标的累计收益对比图"
    onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(normalized.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (normalized.length - 1))))); }}
    onPointerLeave={() => setHover(null)}>
    <defs><linearGradient id={`performance-fill-${settings.theme}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-primary)" stopOpacity=".22"/><stop offset="1" stopColor="var(--chart-primary)" stopOpacity="0"/></linearGradient></defs>
    {settings.showGrid && [0, 1, 2, 3, 4].map((tick) => { const value = max - (tick / 4) * (max - min); return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/><text x={left - 11} y={y(value) + 4} className="axis-label" textAnchor="end">{((value - 1) * 100).toFixed(0)}%</text></g>; })}
    {!settings.showGrid && [0, 1, 2, 3, 4].map((tick) => { const value = max - (tick / 4) * (max - min); return <text key={tick} x={left - 11} y={y(value) + 4} className="axis-label" textAnchor="end">{((value - 1) * 100).toFixed(0)}%</text>; })}
    <line x1={left} x2={width - right} y1={y(1)} y2={y(1)} className="zero-line"/>
    {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} className="axis-label" textAnchor="middle">{normalized[index]?.date.slice(0, 7)}</text>)}
    {settings.showArea && <polygon points={area} fill={`url(#performance-fill-${settings.theme})`}/>} 
    {peerNormalized.map((peer, index) => <polyline key={`${peer.label}-${index}`} className={`peer-line peer-line-${index % 4}`} style={{ strokeWidth: Math.max(1.2, lineWidth - .6) }} points={points(peer.series)}/>)}
    {benchmarkNormalized.length > 0 && <polyline className="benchmark-line" style={{ strokeWidth: lineWidth }} points={points(benchmarkNormalized)}/>} 
    <polyline className="performance-line" style={{ strokeWidth: lineWidth }} points={points(normalized)}/>
    {hover != null && normalized[hover] && <g>
      <line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} className="hover-line"/>
      <circle cx={x(hover)} cy={y(normalized[hover].value)} r="5" className="hover-dot"/>
      <g transform={`translate(${Math.min(width - 238, Math.max(left, x(hover) - 108))}, ${Math.max(8, y(normalized[hover].value) - 82)})`}>
        <rect width="220" height={benchmarkNormalized[hover] ? 68 : 50} rx="8" className="tooltip-bg"/>
        <text x="12" y="19" className="tooltip-date">{normalized[hover].date}</text>
        <text x="12" y="39" className="tooltip-value">{primaryLabel} {((normalized[hover].value - 1) * 100).toFixed(2)}%</text>
        {benchmarkNormalized[hover] && <text x="12" y="58" className="tooltip-benchmark">{benchmarkLabel} {((benchmarkNormalized[hover].value - 1) * 100).toFixed(2)}%</text>}
      </g>
    </g>}
  </svg>;
}

export function DrawdownChart({ primary, benchmark, settings }: {
  primary: { date: string; value: number }[];
  benchmark?: { date: string; value: number }[];
  settings: ChartSettings;
}) {
  const visibleBenchmark = settings.showBenchmark ? benchmark : undefined;
  const width = 650, height = 420, left = 58, right = 20, top = 26, bottom = 46;
  const min = Math.min(-0.01, ...primary.map((point) => point.value), ...(visibleBenchmark ?? []).map((point) => point.value)) * 1.15;
  const x = (index: number, length = primary.length) => left + (index / Math.max(1, length - 1)) * (width - left - right);
  const y = (value: number) => top + ((0 - value) / Math.abs(min)) * (height - top - bottom);
  const line = (items: { value: number }[]) => items.map((point, index) => `${x(index, items.length)},${y(point.value)}`).join(" ");
  const area = `${left},${y(0)} ${line(primary)} ${width - right},${y(0)}`;
  const tickIndexes = Array.from({ length: 5 }, (_, index) => Math.round((index / 4) * (primary.length - 1)));
  const lineWidth = widthValue[settings.lineWidth];
  return <svg className={`chart chart-theme-${settings.theme}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标的与基准回撤对比图">
    <defs><linearGradient id={`drawdown-fill-${settings.theme}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-drawdown)" stopOpacity=".62"/><stop offset="1" stopColor="var(--chart-drawdown)" stopOpacity=".04"/></linearGradient></defs>
    {[0, 1, 2, 3, 4].map((tick) => { const value = (min * tick) / 4; return <g key={tick}>{settings.showGrid && <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/>}<text x={left - 10} y={y(value) + 4} className="axis-label" textAnchor="end">{(value * 100).toFixed(0)}%</text></g>; })}
    {settings.showArea && <polygon points={area} fill={`url(#drawdown-fill-${settings.theme})`}/>} 
    <polyline className="drawdown-line" style={{ strokeWidth: lineWidth }} points={line(primary)}/>
    {visibleBenchmark?.length ? <polyline className="benchmark-drawdown-line" style={{ strokeWidth: lineWidth }} points={line(visibleBenchmark)}/> : null}
    {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} className="axis-label" textAnchor="middle">{primary[index]?.date.slice(0, 7)}</text>)}
  </svg>;
}

export function RollingReturnChart({ rolling, selected, settings }: {
  rolling: Record<RollingHorizonId, RollingWinRate>;
  selected: RollingHorizonId[];
  settings: ChartSettings;
}) {
  const series = selected.map((id) => rolling[id]).filter((item) => item.points.length);
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const padding = Math.max(.02, (max - min) * .09);
  const low = min - padding, high = max + padding;
  const width = 1040, height = 360, left = 64, right = 24, top = 24, bottom = 46;
  const x = (index: number, length: number) => left + (index / Math.max(1, length - 1)) * (width - left - right);
  const y = (value: number) => top + ((high - value) / Math.max(.001, high - low)) * (height - top - bottom);
  const points = (items: { value: number }[]) => items.map((point, index) => `${x(index, items.length)},${y(point.value)}`).join(" ");
  const longest = [...series].sort((a, b) => b.points.length - a.points.length)[0]?.points ?? [];
  const tickIndexes = Array.from({ length: 6 }, (_, index) => Math.round((index / 5) * Math.max(0, longest.length - 1)));
  return <svg className={`chart chart-theme-${settings.theme}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="季度、半年度和年度滚动收益轨迹">
    {[0, 1, 2, 3, 4].map((tick) => { const value = high - (tick / 4) * (high - low); return <g key={tick}>{settings.showGrid && <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/>}<text x={left - 11} y={y(value) + 4} className="axis-label" textAnchor="end">{(value * 100).toFixed(0)}%</text></g>; })}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="zero-line"/>
    {tickIndexes.map((index) => <text key={index} x={x(index, longest.length)} y={height - 12} className="axis-label" textAnchor="middle">{longest[index]?.date.slice(0, 7)}</text>)}
    {series.map((item) => <polyline key={item.id} className={`rolling-line rolling-${item.id}`} style={{ strokeWidth: widthValue[settings.lineWidth] }} points={points(item.points)}/>)}
  </svg>;
}

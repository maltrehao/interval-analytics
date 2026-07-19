"use client";

import { useMemo, useState } from "react";
import {
  calculate, composeBenchmark, defaultMetrics, formatMetric, metricDefinitions,
  type MetricId, type PricePoint,
} from "./analytics";

type Asset = { code: string; name: string; kind: string; kindLabel: string };
type BenchmarkDraft = { id: string; query: string; kind: string; weight: number };
type BenchmarkResolved = BenchmarkDraft & { asset: Asset; source: string; series: PricePoint[] };

const presets = ["沪深300", "中证A500", "中证500", "中证1000", "中债综合指数", "中证全债指数"];
const comparableMetrics: MetricId[] = ["return", "annualized", "drawdown", "volatility", "sharpe", "calmar", "sortino", "winRate"];

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function shiftDate(base: Date, months: number) {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function buildDemoSeries(multiplier = 1) {
  const values: PricePoint[] = [];
  const start = new Date("2025-07-17T00:00:00Z");
  let value = 1;
  for (let i = 0; i < 262; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + Math.round(i * 1.4));
    const shock = i > 42 && i < 76 ? -0.0042 * multiplier : 0;
    const recovery = i >= 76 && i < 145 ? 0.0023 * multiplier : 0;
    const daily = 0.00055 + Math.sin(i * 0.41) * 0.0042 * multiplier + Math.sin(i * 0.09) * 0.0024 * multiplier + shock + recovery;
    value *= 1 + daily;
    values.push({ date: isoDate(date), value });
  }
  return values;
}

function MetricIcon({ id }: { id: MetricId }) {
  const glyphs: Partial<Record<MetricId, string>> = {
    return: "↗", annualized: "%", drawdown: "↓", recovery: "◫", volatility: "∿",
    downsideVolatility: "⌄", sharpe: "S", calmar: "C", sortino: "So", winRate: "✓",
    positiveMonths: "M", var95: "V", cvar95: "CV", maxLoss: "↘", maxGain: "↗",
    skewness: "Sk", kurtosis: "K", excessReturn: "α+", alpha: "α", beta: "β",
    trackingError: "TE", informationRatio: "IR", correlation: "ρ", upCapture: "↑", downCapture: "↓",
  };
  return <span className={`metric-icon metric-icon-${id}`}>{glyphs[id]}</span>;
}

function PerformanceChart({ primary, benchmark, primaryLabel, benchmarkLabel }: {
  primary: PricePoint[]; benchmark: PricePoint[]; primaryLabel: string; benchmarkLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const normalized = primary.map((point) => ({ date: point.date, value: point.value / primary[0].value }));
  const benchmarkNormalized = benchmark.length ? benchmark.map((point) => ({ date: point.date, value: point.value / benchmark[0].value })) : [];
  const allValues = [...normalized, ...benchmarkNormalized].map((point) => point.value);
  const min = Math.min(...allValues) * 0.985;
  const max = Math.max(...allValues) * 1.015;
  const width = 1040, height = 390, left = 62, right = 20, top = 22, bottom = 44;
  const x = (index: number) => left + (index / Math.max(1, normalized.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((max - value) / Math.max(0.0001, max - min)) * (height - top - bottom);
  const points = (items: { value: number }[]) => items.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const tickIndexes = Array.from({ length: 6 }, (_, index) => Math.round((index / 5) * (normalized.length - 1)));
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标的与自定义基准累计收益对比图"
      onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(normalized.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (normalized.length - 1))))); }}
      onPointerLeave={() => setHover(null)}>
      {[0, 1, 2, 3, 4].map((tick) => {
        const value = max - (tick / 4) * (max - min);
        return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/><text x={left - 11} y={y(value) + 4} className="axis-label" textAnchor="end">{((value - 1) * 100).toFixed(0)}%</text></g>;
      })}
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} className="axis-label" textAnchor="middle">{normalized[index]?.date.slice(0, 7)}</text>)}
      {benchmarkNormalized.length > 0 && <polyline className="benchmark-line" points={points(benchmarkNormalized)}/>} 
      <polyline className="performance-line" points={points(normalized)}/>
      {hover != null && normalized[hover] && <g>
        <line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} className="hover-line"/>
        <circle cx={x(hover)} cy={y(normalized[hover].value)} r="5" className="hover-dot"/>
        {benchmarkNormalized[hover] && <circle cx={x(hover)} cy={y(benchmarkNormalized[hover].value)} r="5" className="benchmark-dot"/>}
        <g transform={`translate(${Math.min(width - 230, Math.max(left, x(hover) - 104))}, ${Math.max(8, y(normalized[hover].value) - 82)})`}>
          <rect width="210" height={benchmarkNormalized[hover] ? 68 : 50} rx="6" className="tooltip-bg"/>
          <text x="11" y="19" className="tooltip-date">{normalized[hover].date}</text>
          <text x="11" y="39" className="tooltip-value">{primaryLabel} {((normalized[hover].value - 1) * 100).toFixed(2)}%</text>
          {benchmarkNormalized[hover] && <text x="11" y="58" className="tooltip-benchmark">{benchmarkLabel} {((benchmarkNormalized[hover].value - 1) * 100).toFixed(2)}%</text>}
        </g>
      </g>}
    </svg>
  );
}

function DrawdownChart({ primary, benchmark }: { primary: { date: string; value: number }[]; benchmark?: { date: string; value: number }[] }) {
  const width = 650, height = 390, left = 58, right = 20, top = 22, bottom = 44;
  const min = Math.min(-0.01, ...primary.map((point) => point.value), ...(benchmark ?? []).map((point) => point.value)) * 1.15;
  const x = (index: number) => left + (index / Math.max(1, primary.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((0 - value) / Math.abs(min)) * (height - top - bottom);
  const line = (items: { value: number }[]) => items.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const area = `${left},${y(0)} ${line(primary)} ${width - right},${y(0)}`;
  const tickIndexes = Array.from({ length: 5 }, (_, index) => Math.round((index / 4) * (primary.length - 1)));
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="标的与基准回撤对比图">
    {[0, 1, 2, 3, 4].map((tick) => { const value = (min * tick) / 4; return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line"/><text x={left - 10} y={y(value) + 4} className="axis-label" textAnchor="end">{(value * 100).toFixed(0)}%</text></g>; })}
    <defs><linearGradient id="drawdown-fill-v2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d86aa" stopOpacity=".72"/><stop offset="1" stopColor="#9eb0c8" stopOpacity=".14"/></linearGradient></defs>
    <polygon points={area} fill="url(#drawdown-fill-v2)"/>
    <polyline className="drawdown-line" points={line(primary)}/>
    {benchmark?.length ? <polyline className="benchmark-drawdown-line" points={line(benchmark)}/> : null}
    {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} className="axis-label" textAnchor="middle">{primary[index]?.date.slice(0, 7)}</text>)}
  </svg>;
}

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const demoPrimary = useMemo(() => buildDemoSeries(1), []);
  const demoBenchmark = useMemo(() => buildDemoSeries(.58), []);
  const [query, setQuery] = useState("022430");
  const [kind, setKind] = useState("auto");
  const [start, setStart] = useState(shiftDate(today, -12));
  const [end, setEnd] = useState(isoDate(today));
  const [selected, setSelected] = useState<MetricId[]>(defaultMetrics);
  const [showMore, setShowMore] = useState(false);
  const [riskFreeRate, setRiskFreeRate] = useState(1.5);
  const [asset, setAsset] = useState<Asset>({ code: "022430", name: "示例标的", kind: "fund", kindLabel: "基金" });
  const [series, setSeries] = useState<PricePoint[]>(demoPrimary);
  const [benchmarkSeries, setBenchmarkSeries] = useState<PricePoint[]>(demoBenchmark);
  const [benchmarks, setBenchmarks] = useState<BenchmarkDraft[]>([
    { id: "benchmark-1", query: "沪深300", kind: "index", weight: 80 },
    { id: "benchmark-2", query: "中债综合指数", kind: "index", weight: 20 },
  ]);
  const [resolvedBenchmarks, setResolvedBenchmarks] = useState<BenchmarkResolved[]>([]);
  const [source, setSource] = useState("示例数据 · 点击“开始分析”获取公开行情");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [chartTitle, setChartTitle] = useState("区间收益与自定义基准对比");
  const analysis = useMemo(() => calculate(series, riskFreeRate / 100, benchmarkSeries), [series, riskFreeRate, benchmarkSeries]);
  const totalWeight = benchmarks.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const benchmarkLabel = resolvedBenchmarks.length
    ? resolvedBenchmarks.map((item) => `${item.asset.name}${item.weight}%`).join(" + ")
    : benchmarks.filter((item) => item.query).map((item) => `${item.query}${item.weight}%`).join(" + ");
  const sourceLabel = resolvedBenchmarks.length
    ? [...new Set([source.split(" · ")[0], ...resolvedBenchmarks.map((item) => item.source)])].join("、")
    : source.split(" · ")[0];

  const updateBenchmark = (id: string, patch: Partial<BenchmarkDraft>) => setBenchmarks((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addBenchmark = (queryValue = "") => {
    if (benchmarks.some((item) => item.query === queryValue) && queryValue) return;
    setBenchmarks((items) => [...items, { id: `benchmark-${Date.now()}`, query: queryValue, kind: "index", weight: 0 }]);
  };
  const chooseRange = (months: number | "ytd" | "all") => {
    if (months === "ytd") setStart(`${end.slice(0, 4)}-01-01`);
    else if (months === "all") setStart("1990-01-01");
    else setStart(shiftDate(new Date(`${end}T00:00:00`), -months));
  };
  const toggleMetric = (id: MetricId) => setSelected((items) => items.includes(id) ? (items.length > 1 ? items.filter((item) => item !== id) : items) : [...items, id]);

  const fetchAsset = async (target: { query: string; kind: string }) => {
    const params = new URLSearchParams({ query: target.query, kind: target.kind, start, end });
    const response = await fetch(`/api/market?${params.toString()}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(`${target.query}：${json.error ?? "行情获取失败"}`);
    return json as { asset: Asset; source: string; series: PricePoint[] };
  };

  const runAnalysis = async () => {
    const activeBenchmarks = benchmarks.filter((item) => item.query.trim() && item.weight > 0);
    if (activeBenchmarks.length && Math.abs(totalWeight - 100) > .01) {
      setError(`基准权重合计为${totalWeight.toFixed(1)}%，请调整至100%`); setStatus("error"); return;
    }
    setStatus("loading"); setError("");
    try {
      const [primaryResult, ...benchmarkResults] = await Promise.all([
        fetchAsset({ query, kind }),
        ...activeBenchmarks.map((item) => fetchAsset(item)),
      ]);
      const resolved = benchmarkResults.map((result, index) => ({ ...activeBenchmarks[index], ...result }));
      const composed = resolved.length
        ? composeBenchmark(primaryResult.series, resolved.map((item) => ({ series: item.series, weight: item.weight / 100 })))
        : { primary: primaryResult.series, benchmark: [] as PricePoint[] };
      if (composed.primary.length < 2) throw new Error("标的与基准缺少足够的共同交易日期");
      setAsset(primaryResult.asset);
      setSeries(composed.primary);
      setBenchmarkSeries(composed.benchmark);
      setResolvedBenchmarks(resolved);
      setSource(`${primaryResult.source} · ${composed.primary[0].date}—${composed.primary.at(-1)!.date}`);
      setStatus("success");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "行情获取失败，请稍后重试");
      setStatus("error");
    }
  };

  const exportCsv = () => {
    const benchmarkMap = new Map(benchmarkSeries.map((item) => [item.date, item.value]));
    const drawdownMap = new Map(analysis.drawdowns.map((item) => [item.date, item.value]));
    const rows = ["日期,标的净值或收盘价,标的累计收益,复合基准累计收益,标的回撤", ...series.map((point) => `${point.date},${point.value},${point.value / series[0].value - 1},${benchmarkMap.has(point.date) ? benchmarkMap.get(point.date)! / benchmarkSeries[0].value - 1 : ""},${drawdownMap.get(point.date) ?? 0}`)];
    const blob = new Blob(["\ufeff", rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${asset.code}_${start}_${end}_区间对比分析.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400; canvas.height = 1350;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#172033"; ctx.font = '700 52px "Microsoft YaHei", sans-serif'; ctx.fillText(chartTitle, 100, 100);
    ctx.fillStyle = "#667085"; ctx.font = '28px "Microsoft YaHei", sans-serif'; ctx.fillText(`${asset.name}（${asset.code}）｜${series[0].date}—${series.at(-1)!.date}`, 100, 150);
    ctx.strokeStyle = "#dfe3e8"; ctx.beginPath(); ctx.moveTo(100, 180); ctx.lineTo(2300, 180); ctx.stroke();
    const cards: [string, string][] = [
      ["区间收益", formatMetric("return", analysis.values.return)], ["年化收益", formatMetric("annualized", analysis.values.annualized)],
      ["最大回撤", formatMetric("drawdown", analysis.values.drawdown)], ["区间超额", formatMetric("excessReturn", analysis.values.excessReturn)],
    ];
    cards.forEach(([label, value], index) => {
      const x = 100 + index * 550; ctx.fillStyle = "#f8f9fb"; ctx.fillRect(x, 220, 500, 130);
      ctx.fillStyle = "#667085"; ctx.font = '24px "Microsoft YaHei", sans-serif'; ctx.fillText(label, x + 28, 265);
      ctx.fillStyle = value.startsWith("-") ? "#169b62" : "#c84848"; ctx.font = '700 42px "Microsoft YaHei", sans-serif'; ctx.fillText(value, x + 28, 325);
    });
    const drawLineChart = (x0: number, y0: number, w: number, h: number) => {
      const primary = series.map((point) => point.value / series[0].value - 1);
      const bench = benchmarkSeries.map((point) => point.value / benchmarkSeries[0].value - 1);
      const values = [...primary, ...bench]; const low = Math.min(...values); const high = Math.max(...values); const range = Math.max(.001, high - low);
      ctx.strokeStyle = "#e2e6ec"; ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i += 1) { const y = y0 + (i / 4) * h; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
      const draw = (items: number[], color: string, width: number) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); items.forEach((value, index) => { const x = x0 + (index / Math.max(1, items.length - 1)) * w; const y = y0 + ((high - value) / range) * h; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); };
      if (bench.length) draw(bench, "#e69b36", 5); draw(primary, "#315cf4", 6);
      ctx.fillStyle = "#172033"; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText("累计收益走势", x0, y0 - 38);
      ctx.fillStyle = "#315cf4"; ctx.fillRect(x0 + 270, y0 - 54, 42, 5); ctx.fillStyle = "#536077"; ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillText(asset.name, x0 + 326, y0 - 40);
      if (bench.length) { ctx.fillStyle = "#e69b36"; ctx.fillRect(x0 + 650, y0 - 54, 42, 5); ctx.fillStyle = "#536077"; ctx.fillText("自定义复合基准", x0 + 706, y0 - 40); }
    };
    const drawDrawdown = (x0: number, y0: number, w: number, h: number) => {
      const items = analysis.drawdowns.map((item) => item.value); const low = Math.min(...items, -.01);
      ctx.fillStyle = "#172033"; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText("历史回撤", x0, y0 - 38);
      ctx.strokeStyle = "#e2e6ec"; ctx.lineWidth = 2; for (let i = 0; i <= 4; i += 1) { const y = y0 + (i / 4) * h; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
      ctx.strokeStyle = "#5d7699"; ctx.lineWidth = 5; ctx.beginPath(); items.forEach((value, index) => { const x = x0 + (index / Math.max(1, items.length - 1)) * w; const y = y0 + (value / low) * h; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    };
    drawLineChart(110, 455, 1380, 590); drawDrawdown(1600, 455, 680, 590);
    ctx.strokeStyle = "#dfe3e8"; ctx.beginPath(); ctx.moveTo(100, 1110); ctx.lineTo(2300, 1110); ctx.stroke();
    ctx.fillStyle = "#536077"; ctx.font = '24px "Microsoft YaHei", sans-serif'; ctx.fillText(`复合基准：${benchmarkLabel || "未设置"}`, 100, 1165);
    ctx.fillStyle = "#667085"; ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillText(`数据来源：${sourceLabel}；计算口径：复合基准每日按设定权重再平衡。`, 100, 1220);
    ctx.fillStyle = "#98a2b3"; ctx.font = '20px "Microsoft YaHei", sans-serif'; ctx.fillText("市场有风险，投资需谨慎；数据与测算仅供参考，不构成任何投资建议。", 100, 1270);
    const url = canvas.toDataURL("image/png"); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${asset.code}_${chartTitle}.png`; anchor.click();
  };

  const visibleDefinitions = showMore ? metricDefinitions : metricDefinitions.slice(0, 10);
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true"><span/><span/><span/><i>↗</i></div>
      <div className="brand-copy"><h1>区间收益分析助手</h1><p>绝对收益、风险指标与自定义复合基准一站式分析</p></div>
      <div className="header-actions">
        <label className="risk-free">无风险利率 <input type="number" step="0.1" min="0" max="20" value={riskFreeRate} onChange={(event) => setRiskFreeRate(Number(event.target.value))}/>%</label>
        <button className="export-button" onClick={exportCsv}>导出数据</button>
      </div>
    </header>

    <section className="analysis-panel" aria-label="分析条件">
      <div className="control-column asset-column">
        <label className="field-label" htmlFor="asset-input">分析标的</label>
        <div className="search-control"><span className="search-icon">⌕</span><input id="asset-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="基金代码、股票代码或指数名称" onKeyDown={(event) => { if (event.key === "Enter") runAnalysis(); }}/><select aria-label="资产类型" value={kind} onChange={(event) => setKind(event.target.value)}><option value="auto">自动识别</option><option value="fund">基金</option><option value="stock">股票</option><option value="index">指数</option></select></div>
        <div className={`recognition recognition-${status}`}><span>✓</span>{status === "loading" ? "正在拉取标的与基准…" : `已识别 · ${asset.kindLabel}`}</div>
        <h2>{asset.name}</h2><p className="asset-meta">{asset.kindLabel} <b>·</b> {asset.code}</p>
      </div>
      <div className="control-column period-column">
        <label className="field-label">分析区间</label>
        <div className="date-row"><input aria-label="开始日期" type="date" value={start} onChange={(event) => setStart(event.target.value)}/><span>~</span><input aria-label="结束日期" type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></div>
        <div className="quick-ranges"><button onClick={() => chooseRange(1)}>近1月</button><button onClick={() => chooseRange(3)}>近3月</button><button onClick={() => chooseRange(6)}>近6月</button><button onClick={() => chooseRange("ytd")}>今年以来</button><button onClick={() => chooseRange(12)}>近1年</button><button onClick={() => chooseRange(36)}>近3年</button><button onClick={() => chooseRange("all")}>成立以来</button></div>
      </div>
      <div className="control-column metric-column">
        <div className="metric-heading"><label className="field-label">选择指标 <em>{metricDefinitions.length}项</em></label><button className="text-button" onClick={() => setShowMore((value) => !value)}>{showMore ? "收起" : "查看全部指标"}</button></div>
        <div className="metric-choices">{visibleDefinitions.map((metric) => <button key={metric.id} type="button" className={`${selected.includes(metric.id) ? "selected" : ""} metric-choice-${metric.group === "相对基准" ? "relative" : "base"}`} onClick={() => toggleMetric(metric.id)}><span>{selected.includes(metric.id) ? "✓" : ""}</span>{metric.compact}</button>)}</div>
        <div className="run-row"><p>{source}</p><button className="run-button" onClick={runAnalysis} disabled={status === "loading"}>{status === "loading" ? <><i className="spinner"/>分析中</> : "开始分析"}</button></div>
        {error && <div className="error-message" role="alert">{error}；当前保留上一组结果。</div>}
      </div>
    </section>

    <section className="benchmark-panel" aria-label="自定义复合基准">
      <div className="benchmark-header"><div><h2>自定义复合基准</h2><p>各成分先计算日收益，再按设定权重每日再平衡合成；支持宽基、行业、债券指数自由搭配。</p></div><div className={`weight-total ${Math.abs(totalWeight - 100) < .01 ? "valid" : "invalid"}`}>权重合计 <strong>{totalWeight.toFixed(0)}%</strong></div></div>
      <div className="benchmark-content">
        <div className="benchmark-rows">{benchmarks.map((item, index) => <div className="benchmark-row" key={item.id}>
          <span className="benchmark-number">{index + 1}</span><input value={item.query} onChange={(event) => updateBenchmark(item.id, { query: event.target.value })} placeholder="输入指数代码或名称"/>
          <select value={item.kind} onChange={(event) => updateBenchmark(item.id, { kind: event.target.value })}><option value="auto">自动</option><option value="index">指数</option><option value="fund">基金</option><option value="stock">股票</option></select>
          <label><input type="number" min="0" max="100" step="1" value={item.weight} onChange={(event) => updateBenchmark(item.id, { weight: Number(event.target.value) })}/><span>%</span></label>
          <button className="remove-benchmark" aria-label={`删除基准成分${index + 1}`} onClick={() => setBenchmarks((items) => items.filter((entry) => entry.id !== item.id))}>×</button>
        </div>)}</div>
        <div className="benchmark-tools"><button className="add-benchmark" onClick={() => addBenchmark()}>＋ 添加成分</button><div className="preset-list"><span>快捷添加</span>{presets.map((preset) => <button key={preset} onClick={() => addBenchmark(preset)}>{preset}</button>)}</div></div>
      </div>
    </section>

    <section className={`metrics-grid ${status === "loading" ? "is-loading" : ""}`} aria-label="绩效指标">
      {metricDefinitions.filter((metric) => selected.includes(metric.id)).map((metric) => {
        const raw = analysis.values[metric.id];
        const benchmarkRaw = analysis.benchmark && comparableMetrics.includes(metric.id) ? (analysis.benchmark.values as Record<string, number | null>)[metric.id] : null;
        const tone = ["drawdown", "maxLoss", "var95", "cvar95"].includes(metric.id) ? "negative" : raw != null && raw > 0 ? "positive" : "neutral";
        return <article className={`metric-card ${metric.group === "相对基准" ? "relative-card" : ""}`} key={metric.id}><MetricIcon id={metric.id}/><div><p>{metric.label}</p><strong className={tone}>{metric.id === "recovery" && raw == null ? "尚未修复" : formatMetric(metric.id, raw)}</strong>{metric.id === "recovery" ? <small>{analysis.dates.peak} → {analysis.dates.recovered ?? "未修复"}</small> : benchmarkRaw != null ? <small>基准 {formatMetric(metric.id, benchmarkRaw)}</small> : metric.group === "相对基准" ? <small>相对自定义复合基准</small> : null}</div></article>;
      })}
    </section>

    <section className="image-toolbar"><div><label>图表标题 <input value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} maxLength={42}/></label><p>下载图片将自动附带区间、基准配比、数据来源和风险提示。</p></div><button onClick={exportPng}>下载高清PNG</button></section>

    <section className={`charts-grid ${status === "loading" ? "is-loading" : ""}`}>
      <article className="chart-card performance-card">
        <div className="chart-report-header"><div><h3>{chartTitle}</h3><p>{asset.name}（{asset.code}）｜{series[0].date}—{series.at(-1)!.date}</p></div><div className="legend"><span className="legend-blue"/>{asset.name}<span className="legend-orange"/>自定义复合基准</div></div>
        <div className="chart-wrap"><PerformanceChart primary={series} benchmark={benchmarkSeries} primaryLabel={asset.name} benchmarkLabel="复合基准"/></div>
        <div className="figure-source">数据来源：{sourceLabel}；复合基准：{benchmarkLabel || "未设置"}。观点及测算仅供参考，不构成投资建议。</div>
      </article>
      <article className="chart-card drawdown-card">
        <div className="chart-report-header"><div><h3>区间回撤与修复</h3><p>前高：{analysis.dates.peak}｜谷底：{analysis.dates.trough}｜{analysis.dates.recovered ? `修复：${analysis.dates.recovered}` : "尚未修复"}</p></div><div className="drawdown-summary">标的 <strong>{formatMetric("drawdown", analysis.values.drawdown)}</strong></div></div>
        <div className="chart-wrap"><DrawdownChart primary={analysis.drawdowns} benchmark={analysis.benchmark?.drawdowns}/></div>
        <div className="figure-source">数据来源：{sourceLabel}；最大回撤按历史峰值至后续低点计算，修复以重新达到前高为准。</div>
      </article>
    </section>

    {analysis.benchmark && <section className="comparison-table"><div className="comparison-heading"><h2>标的与复合基准指标对比</h2><p>{benchmarkLabel}</p></div><div className="comparison-grid"><div className="comparison-row comparison-header-row"><span>指标</span><span>{asset.name}</span><span>复合基准</span><span>相对表现</span></div>{(["return", "annualized", "volatility", "drawdown", "sharpe", "calmar"] as MetricId[]).map((id) => { const definition = metricDefinitions.find((item) => item.id === id)!; const assetValue = analysis.values[id]; const benchmarkValue = (analysis.benchmark!.values as Record<string, number | null>)[id]; const difference = assetValue != null && benchmarkValue != null ? assetValue - benchmarkValue : null; return <div className="comparison-row" key={id}><strong>{definition.label}</strong><span>{formatMetric(id, assetValue)}</span><span>{formatMetric(id, benchmarkValue)}</span><span className={difference != null && difference >= 0 ? "positive" : "negative"}>{difference == null ? "—" : formatMetric(id, difference)}</span></div>; })}</div></section>}

    <footer><span>ⓘ</span> 数据仅供分析，不构成投资建议。年化指标按252个交易日计；Alpha、Beta与捕获率均基于所选区间日收益估算。</footer>
  </main>;
}

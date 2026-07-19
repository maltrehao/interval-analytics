"use client";

import { useMemo, useState } from "react";
import {
  calculate, calculateRollingWinRates, composeBenchmark, defaultMetrics, formatMetric, metricDefinitions,
  rollingHorizonDefinitions, type MetricId, type PricePoint, type RollingHorizonId,
} from "./analytics";
import { AssetSearchInput, assetDisplay, type AssetCandidate, type AssetKind } from "./asset-search";
import {
  DrawdownChart as ReportDrawdownChart, PerformanceChart as ReportPerformanceChart, RollingReturnChart,
  chartThemeLabels, type ChartLineWidth, type ChartSettings, type ChartTheme,
} from "./report-charts";

type Asset = AssetCandidate;
type BenchmarkDraft = { id: string; query: string; kind: AssetKind; weight: number; asset?: Asset | null };
type BenchmarkResolved = BenchmarkDraft & { asset: Asset; source: string; series: PricePoint[] };
type PeerDraft = { id: string; query: string; kind: AssetKind; asset?: Asset | null };
type PeerResolved = PeerDraft & { asset: Asset; source: string; series: PricePoint[] };

const presets = ["沪深300", "中证全A", "中证A500", "中证500", "中证1000", "国债指数", "企债指数"];
const comparableMetrics: MetricId[] = ["return", "annualized", "drawdown", "volatility", "sharpe", "calmar", "sortino", "winRate"];

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function shiftDate(base: Date, months: number) {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function formatPercentValue(value: number | null) {
  return value == null ? "数据不足" : `${(value * 100).toFixed(1)}%`;
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

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const demoPrimary = useMemo(() => buildDemoSeries(1), []);
  const demoBenchmark = useMemo(() => buildDemoSeries(.58), []);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind>("auto");
  const [start, setStart] = useState(shiftDate(today, -12));
  const [end, setEnd] = useState(isoDate(today));
  const [selected, setSelected] = useState<MetricId[]>(defaultMetrics);
  const [showMore, setShowMore] = useState(false);
  const [riskFreeRate, setRiskFreeRate] = useState(1.5);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [asset, setAsset] = useState<Asset>({ code: "DEMO", name: "等待选择标的", kind: "fund", kindLabel: "演示" });
  const [series, setSeries] = useState<PricePoint[]>(demoPrimary);
  const [benchmarkSeries, setBenchmarkSeries] = useState<PricePoint[]>(demoBenchmark);
  const [benchmarks, setBenchmarks] = useState<BenchmarkDraft[]>([
    { id: "benchmark-1", query: "沪深300", kind: "auto", weight: 80 },
    { id: "benchmark-2", query: "国债指数", kind: "auto", weight: 20 },
  ]);
  const [resolvedBenchmarks, setResolvedBenchmarks] = useState<BenchmarkResolved[]>([]);
  const [peers, setPeers] = useState<PeerDraft[]>([]);
  const [resolvedPeers, setResolvedPeers] = useState<PeerResolved[]>([]);
  const [source, setSource] = useState("示例数据 · 点击“开始分析”获取公开行情");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [chartTitle, setChartTitle] = useState("区间收益与自定义基准对比");
  const [customSourceText, setCustomSourceText] = useState("");
  const [benchmarkTableTitle, setBenchmarkTableTitle] = useState("标的与复合基准指标对比");
  const [benchmarkHeaders, setBenchmarkHeaders] = useState(["指标", "", "复合基准", "相对表现"]);
  const [peerTableTitle, setPeerTableTitle] = useState("同类标的横向对比");
  const [peerTableSubtitle, setPeerTableSubtitle] = useState("同一区间、同一计算口径；滚动胜率按各标的自身有效交易日计算。");
  const [peerHeaders, setPeerHeaders] = useState(["标的", "区间收益", "年化收益", "最大回撤", "年化波动", "夏普", "季度胜率", "半年胜率", "年度胜率"]);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({ theme: "ocean", lineWidth: "standard", showBenchmark: true, showGrid: true, showArea: true });
  const [selectedRolling, setSelectedRolling] = useState<RollingHorizonId[]>(["quarter", "halfYear", "year"]);
  const analysis = useMemo(() => calculate(series, riskFreeRate / 100, benchmarkSeries), [series, riskFreeRate, benchmarkSeries]);
  const rolling = useMemo(() => calculateRollingWinRates(series), [series]);
  const benchmarkRolling = useMemo(() => calculateRollingWinRates(benchmarkSeries), [benchmarkSeries]);
  const peerAnalyses = useMemo(() => resolvedPeers.map((peer) => ({
    ...peer,
    analysis: calculate(peer.series, riskFreeRate / 100),
    rolling: calculateRollingWinRates(peer.series),
  })), [resolvedPeers, riskFreeRate]);
  const totalWeight = benchmarks.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const benchmarkLabel = resolvedBenchmarks.length
    ? resolvedBenchmarks.map((item) => `${item.asset.name}${item.weight}%`).join(" + ")
    : benchmarks.filter((item) => item.query).map((item) => `${item.query}${item.weight}%`).join(" + ");
  const sourceLabel = resolvedBenchmarks.length || resolvedPeers.length
    ? [...new Set([source.split(" · ")[0], ...resolvedBenchmarks.map((item) => item.source), ...resolvedPeers.map((item) => item.source)])].join("、")
    : source.split(" · ")[0];
  const sourceCaption = customSourceText.trim() || `数据来源：${sourceLabel}`;

  const updateBenchmark = (id: string, patch: Partial<BenchmarkDraft>) => setBenchmarks((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addBenchmark = (queryValue = "") => {
    if (benchmarks.some((item) => item.query === queryValue) && queryValue) return;
    setBenchmarks((items) => [...items, { id: `benchmark-${Date.now()}`, query: queryValue, kind: "auto", weight: 0 }]);
  };
  const updatePeer = (id: string, patch: Partial<PeerDraft>) => setPeers((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addPeer = () => setPeers((items) => items.length >= 4 ? items : [...items, { id: `peer-${Date.now()}`, query: "", kind: "auto" }]);
  const chooseRange = (months: number | "ytd" | "all") => {
    if (months === "ytd") setStart(`${end.slice(0, 4)}-01-01`);
    else if (months === "all") setStart("1990-01-01");
    else setStart(shiftDate(new Date(`${end}T00:00:00`), -months));
  };
  const toggleMetric = (id: MetricId) => setSelected((items) => items.includes(id) ? (items.length > 1 ? items.filter((item) => item !== id) : items) : [...items, id]);
  const toggleRolling = (id: RollingHorizonId) => setSelectedRolling((items) => items.includes(id) ? (items.length > 1 ? items.filter((item) => item !== id) : items) : [...items, id]);

  const fetchAsset = async (target: { query: string; kind: AssetKind; asset?: Asset | null }) => {
    const params = new URLSearchParams({ query: target.query, kind: target.kind, start, end });
    if (target.asset) {
      params.set("code", target.asset.code);
      params.set("name", target.asset.name);
      params.set("resolvedKind", target.asset.kind);
      if (target.asset.exchange) params.set("exchange", target.asset.exchange);
      if (target.asset.secid) params.set("secid", target.asset.secid);
    }
    const response = await fetch(`/api/market?${params.toString()}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(`${target.query}：${json.error ?? "行情获取失败"}`);
    return json as { asset: Asset; source: string; series: PricePoint[] };
  };

  const runAnalysis = async () => {
    if (!query.trim()) {
      setError("请先搜索并选择一个基金、股票或指数"); setStatus("error"); return;
    }
    const activeBenchmarks = benchmarks.filter((item) => item.query.trim() && item.weight > 0);
    if (activeBenchmarks.length && Math.abs(totalWeight - 100) > .01) {
      setError(`基准权重合计为${totalWeight.toFixed(1)}%，请调整至100%`); setStatus("error"); return;
    }
    setStatus("loading"); setError("");
    try {
      const activePeers = peers.filter((item) => item.query.trim());
      const [primaryResult, benchmarkResults, peerResults] = await Promise.all([
        fetchAsset({ query, kind, asset: selectedAsset }),
        Promise.all(activeBenchmarks.map((item) => fetchAsset(item))),
        Promise.all(activePeers.map((item) => fetchAsset(item))),
      ]);
      const resolved = benchmarkResults.map((result, index) => ({ ...activeBenchmarks[index], ...result }));
      const resolvedPeerResults = peerResults.map((result, index) => ({ ...activePeers[index], ...result }));
      const composed = resolved.length
        ? composeBenchmark(primaryResult.series, resolved.map((item) => ({ series: item.series, weight: item.weight / 100 })))
        : { primary: primaryResult.series, benchmark: [] as PricePoint[] };
      if (composed.primary.length < 2) throw new Error("标的与基准缺少足够的共同交易日期");
      setAsset(primaryResult.asset);
      setSelectedAsset(primaryResult.asset);
      setQuery(assetDisplay(primaryResult.asset));
      setSeries(composed.primary);
      setBenchmarkSeries(composed.benchmark);
      setResolvedBenchmarks(resolved);
      setResolvedPeers(resolvedPeerResults);
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
    const rollingMaps = Object.fromEntries(rollingHorizonDefinitions.map((item) => [item.id, new Map(rolling[item.id].points.map((point) => [point.date, point.value]))])) as Record<RollingHorizonId, Map<string, number>>;
    const rows = ["日期,标的净值或收盘价,标的累计收益,复合基准累计收益,标的回撤,季度滚动收益,半年度滚动收益,年度滚动收益", ...series.map((point) => `${point.date},${point.value},${point.value / series[0].value - 1},${benchmarkMap.has(point.date) ? benchmarkMap.get(point.date)! / benchmarkSeries[0].value - 1 : ""},${drawdownMap.get(point.date) ?? 0},${rollingMaps.quarter.get(point.date) ?? ""},${rollingMaps.halfYear.get(point.date) ?? ""},${rollingMaps.year.get(point.date) ?? ""}`)];
    if (peerAnalyses.length) {
      rows.push("", "同类标的,代码,区间收益,年化收益,最大回撤,年化波动,夏普,季度胜率,半年度胜率,年度胜率");
      rows.push(...peerAnalyses.map((item) => `${item.asset.name},${item.asset.code},${item.analysis.values.return ?? ""},${item.analysis.values.annualized ?? ""},${item.analysis.values.drawdown ?? ""},${item.analysis.values.volatility ?? ""},${item.analysis.values.sharpe ?? ""},${item.rolling.quarter.winRate ?? ""},${item.rolling.halfYear.winRate ?? ""},${item.rolling.year.winRate ?? ""}`));
    }
    const blob = new Blob(["\ufeff", rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${asset.code}_${start}_${end}_区间对比分析.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400; canvas.height = 1350;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const palettes: Record<ChartTheme, { primary: string; benchmark: string; drawdown: string; background: string; card: string }> = {
      ocean: { primary: "#315cf4", benchmark: "#e69b36", drawdown: "#5d7699", background: "#ffffff", card: "#f6f8fc" },
      midnight: { primary: "#15213d", benchmark: "#b4832f", drawdown: "#52657e", background: "#fbfaf7", card: "#f0efe9" },
      rose: { primary: "#b33b62", benchmark: "#2f8794", drawdown: "#79556a", background: "#fffafb", card: "#fbf0f3" },
    };
    const palette = palettes[chartSettings.theme];
    const exportLineWidth = chartSettings.lineWidth === "fine" ? 4 : chartSettings.lineWidth === "bold" ? 8 : 6;
    ctx.fillStyle = palette.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#172033"; ctx.font = '700 52px "Microsoft YaHei", sans-serif'; ctx.fillText(chartTitle, 100, 100);
    ctx.fillStyle = "#667085"; ctx.font = '28px "Microsoft YaHei", sans-serif'; ctx.fillText(`${asset.name}（${asset.code}）｜${series[0].date}—${series.at(-1)!.date}`, 100, 150);
    ctx.strokeStyle = "#dfe3e8"; ctx.beginPath(); ctx.moveTo(100, 180); ctx.lineTo(2300, 180); ctx.stroke();
    const cards: [string, string][] = [
      ["区间收益", formatMetric("return", analysis.values.return)], ["年化收益", formatMetric("annualized", analysis.values.annualized)],
      ["最大回撤", formatMetric("drawdown", analysis.values.drawdown)], ["区间超额", formatMetric("excessReturn", analysis.values.excessReturn)],
    ];
    cards.forEach(([label, value], index) => {
      const x = 100 + index * 550; ctx.fillStyle = palette.card; ctx.fillRect(x, 220, 500, 130);
      ctx.fillStyle = "#667085"; ctx.font = '24px "Microsoft YaHei", sans-serif'; ctx.fillText(label, x + 28, 265);
      ctx.fillStyle = value.startsWith("-") ? "#169b62" : "#c84848"; ctx.font = '700 42px "Microsoft YaHei", sans-serif'; ctx.fillText(value, x + 28, 325);
    });
    const drawLineChart = (x0: number, y0: number, w: number, h: number) => {
      const primary = series.map((point) => point.value / series[0].value - 1);
      const bench = chartSettings.showBenchmark ? benchmarkSeries.map((point) => point.value / benchmarkSeries[0].value - 1) : [];
      const peerLines = resolvedPeers.map((peer) => peer.series.map((point) => point.value / peer.series[0].value - 1));
      const values = [...primary, ...bench, ...peerLines.flat()]; const low = Math.min(...values); const high = Math.max(...values); const range = Math.max(.001, high - low);
      ctx.strokeStyle = "#e2e6ec"; ctx.lineWidth = 2;
      if (chartSettings.showGrid) for (let i = 0; i <= 4; i += 1) { const y = y0 + (i / 4) * h; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
      const draw = (items: number[], color: string, width: number) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); items.forEach((value, index) => { const x = x0 + (index / Math.max(1, items.length - 1)) * w; const y = y0 + ((high - value) / range) * h; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); };
      const peerColors = ["#7f8ca8", "#4aa28f", "#9b72b0", "#c27b51"];
      peerLines.forEach((items, index) => draw(items, peerColors[index % peerColors.length], Math.max(3, exportLineWidth - 2)));
      if (bench.length) draw(bench, palette.benchmark, Math.max(3, exportLineWidth - 1)); draw(primary, palette.primary, exportLineWidth);
      ctx.fillStyle = "#172033"; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText("累计收益走势", x0, y0 - 38);
      ctx.fillStyle = palette.primary; ctx.fillRect(x0 + 270, y0 - 54, 42, 5); ctx.fillStyle = "#536077"; ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillText(asset.name, x0 + 326, y0 - 40);
      if (bench.length) { ctx.fillStyle = palette.benchmark; ctx.fillRect(x0 + 650, y0 - 54, 42, 5); ctx.fillStyle = "#536077"; ctx.fillText("自定义复合基准", x0 + 706, y0 - 40); }
    };
    const drawDrawdown = (x0: number, y0: number, w: number, h: number) => {
      const items = analysis.drawdowns.map((item) => item.value); const low = Math.min(...items, -.01);
      ctx.fillStyle = "#172033"; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText("历史回撤", x0, y0 - 38);
      ctx.strokeStyle = "#e2e6ec"; ctx.lineWidth = 2; if (chartSettings.showGrid) for (let i = 0; i <= 4; i += 1) { const y = y0 + (i / 4) * h; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
      ctx.strokeStyle = palette.drawdown; ctx.lineWidth = exportLineWidth; ctx.beginPath(); items.forEach((value, index) => { const x = x0 + (index / Math.max(1, items.length - 1)) * w; const y = y0 + (value / low) * h; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    };
    drawLineChart(110, 455, 1380, 590); drawDrawdown(1600, 455, 680, 590);
    ctx.strokeStyle = "#dfe3e8"; ctx.beginPath(); ctx.moveTo(100, 1110); ctx.lineTo(2300, 1110); ctx.stroke();
    ctx.fillStyle = "#536077"; ctx.font = '24px "Microsoft YaHei", sans-serif'; ctx.fillText(`复合基准：${benchmarkLabel || "未设置"}｜季度/半年/年度滚动胜率：${formatPercentValue(rolling.quarter.winRate)} / ${formatPercentValue(rolling.halfYear.winRate)} / ${formatPercentValue(rolling.year.winRate)}`, 100, 1165);
    ctx.fillStyle = "#667085"; ctx.font = '22px "Microsoft YaHei", sans-serif'; ctx.fillText(`${sourceCaption}；计算口径：复合基准每日按设定权重再平衡。`, 100, 1220);
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
        <label className="field-label">分析标的</label>
        <div className="search-control"><span className="search-icon">⌕</span><AssetSearchInput
          value={query}
          kind={kind}
          selected={selectedAsset}
          placeholder="搜索任意基金、股票或指数"
          onValueChange={(value) => { setQuery(value); setSelectedAsset(null); if (status !== "loading") setStatus("idle"); }}
          onSelect={(item) => { setSelectedAsset(item); setQuery(assetDisplay(item)); setAsset(item); setStatus("idle"); setError(""); }}
          onSubmit={runAnalysis}
        /><select aria-label="资产类型" value={kind} onChange={(event) => { setKind(event.target.value as AssetKind); setSelectedAsset(null); }}><option value="auto">全部类型</option><option value="fund">基金</option><option value="stock">股票</option><option value="index">指数</option></select></div>
        <div className={`recognition recognition-${status}`}><span>{selectedAsset || status === "success" ? "✓" : "⌕"}</span>{status === "loading" ? "正在拉取标的与基准…" : selectedAsset ? `已选择 · ${selectedAsset.kindLabel}，可继续搜索更换` : "输入名称、代码或简称，可随时更换标的"}</div>
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
          <span className="benchmark-number">{index + 1}</span><AssetSearchInput compact value={item.query} kind={item.kind} selected={item.asset}
            placeholder="搜索基准成分名称或代码"
            onValueChange={(value) => updateBenchmark(item.id, { query: value, asset: null })}
            onSelect={(candidate) => updateBenchmark(item.id, { query: assetDisplay(candidate), kind: candidate.kind, asset: candidate })}/>
          <select value={item.kind} onChange={(event) => updateBenchmark(item.id, { kind: event.target.value as AssetKind, asset: null })}><option value="auto">全部</option><option value="index">指数</option><option value="fund">基金</option><option value="stock">股票</option></select>
          <label><input type="number" min="0" max="100" step="1" value={item.weight} onChange={(event) => updateBenchmark(item.id, { weight: Number(event.target.value) })}/><span>%</span></label>
          <button className="remove-benchmark" aria-label={`删除基准成分${index + 1}`} onClick={() => setBenchmarks((items) => items.filter((entry) => entry.id !== item.id))}>×</button>
        </div>)}</div>
        <div className="benchmark-tools"><button className="add-benchmark" onClick={() => addBenchmark()}>＋ 添加成分</button><div className="preset-list"><span>快捷添加</span>{presets.map((preset) => <button key={preset} onClick={() => addBenchmark(preset)}>{preset}</button>)}</div></div>
      </div>
    </section>

    <section className="peer-panel" aria-label="同类标的对比">
      <div className="peer-header"><div><h2>同类标的数据</h2><p>最多添加4个同类基金、股票或指数；重新分析后统一比较收益、风险和滚动胜率。</p></div><button onClick={addPeer} disabled={peers.length >= 4}>＋ 添加同类标的</button></div>
      {peers.length ? <div className="peer-rows">{peers.map((item, index) => <div className="peer-row" key={item.id}>
        <span className={`peer-swatch peer-swatch-${index % 4}`}/><AssetSearchInput compact value={item.query} kind={item.kind} selected={item.asset}
          placeholder="搜索同类标的名称或代码"
          onValueChange={(value) => updatePeer(item.id, { query: value, asset: null })}
          onSelect={(candidate) => updatePeer(item.id, { query: assetDisplay(candidate), kind: candidate.kind, asset: candidate })}/>
        <select value={item.kind} onChange={(event) => updatePeer(item.id, { kind: event.target.value as AssetKind, asset: null })}><option value="auto">全部</option><option value="index">指数</option><option value="fund">基金</option><option value="stock">股票</option></select>
        <button className="remove-benchmark" aria-label={`删除同类标的${index + 1}`} onClick={() => setPeers((items) => items.filter((entry) => entry.id !== item.id))}>×</button>
      </div>)}</div> : <p className="peer-empty">尚未添加同类标的。添加后会同时出现在走势图和同类指标表中。</p>}
    </section>

    <section className={`metrics-grid ${status === "loading" ? "is-loading" : ""}`} aria-label="绩效指标">
      {metricDefinitions.filter((metric) => selected.includes(metric.id)).map((metric) => {
        const raw = analysis.values[metric.id];
        const benchmarkRaw = analysis.benchmark && comparableMetrics.includes(metric.id) ? (analysis.benchmark.values as Record<string, number | null>)[metric.id] : null;
        const tone = ["drawdown", "maxLoss", "var95", "cvar95"].includes(metric.id) ? "negative" : raw != null && raw > 0 ? "positive" : "neutral";
        return <article className={`metric-card ${metric.group === "相对基准" ? "relative-card" : ""}`} key={metric.id}><MetricIcon id={metric.id}/><div><p>{metric.label}</p><strong className={tone}>{metric.id === "recovery" && raw == null ? "尚未修复" : formatMetric(metric.id, raw)}</strong>{metric.id === "recovery" ? <small>{analysis.dates.peak} → {analysis.dates.recovered ?? "未修复"}</small> : benchmarkRaw != null ? <small>基准 {formatMetric(metric.id, benchmarkRaw)}</small> : metric.group === "相对基准" ? <small>相对自定义复合基准</small> : null}</div></article>;
      })}
    </section>

    <section className="rolling-panel" aria-label="滚动胜率">
      <div className="rolling-header"><div><h2>滚动胜率</h2><p>在当前区间内，以每个交易日为观察终点，统计过去约63、126和252个交易日收益为正的比例。</p></div><div className="rolling-toggles">{rollingHorizonDefinitions.map((item) => <button key={item.id} className={selectedRolling.includes(item.id) ? "selected" : ""} onClick={() => toggleRolling(item.id)}>{selectedRolling.includes(item.id) ? "✓ " : ""}{item.label}</button>)}</div></div>
      <div className="rolling-summary-grid">{rollingHorizonDefinitions.map((item) => {
        const current = rolling[item.id];
        const benchmarkCurrent = benchmarkRolling[item.id];
        return <article key={item.id}><span>{item.label}滚动胜率</span><strong>{formatPercentValue(current.winRate)}</strong><p>最近滚动收益 {formatPercentValue(current.latestReturn)}</p><small>{current.observations}个有效窗口{analysis.benchmark ? ` · 基准胜率 ${formatPercentValue(benchmarkCurrent.winRate)}` : ""}</small></article>;
      })}</div>
      <div className="rolling-chart-card"><div className="rolling-legend"><strong>滚动收益轨迹</strong>{rollingHorizonDefinitions.filter((item) => selectedRolling.includes(item.id)).map((item) => <span key={item.id} className={`rolling-legend-${item.id}`}>{item.label}</span>)}</div><RollingReturnChart rolling={rolling} selected={selectedRolling} settings={chartSettings}/><p>曲线位于0%以上代表对应持有期取得正收益；胜率为所有有效滚动窗口中正收益窗口的占比。</p></div>
    </section>

    <section className="image-toolbar chart-settings-panel">
      <div className="chart-title-control"><label>图表标题 <input value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} maxLength={42}/></label><p>下载图片会自动附带区间、基准配比、数据来源和风险提示。</p></div>
      <div className="chart-settings">
        <label>配色<select value={chartSettings.theme} onChange={(event) => setChartSettings((value) => ({ ...value, theme: event.target.value as ChartTheme }))}>{Object.entries(chartThemeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>线宽<select value={chartSettings.lineWidth} onChange={(event) => setChartSettings((value) => ({ ...value, lineWidth: event.target.value as ChartLineWidth }))}><option value="fine">纤细</option><option value="standard">标准</option><option value="bold">醒目</option></select></label>
        <label className="setting-check"><input type="checkbox" checked={chartSettings.showBenchmark} onChange={(event) => setChartSettings((value) => ({ ...value, showBenchmark: event.target.checked }))}/>基准线</label>
        <label className="setting-check"><input type="checkbox" checked={chartSettings.showGrid} onChange={(event) => setChartSettings((value) => ({ ...value, showGrid: event.target.checked }))}/>网格</label>
        <label className="setting-check"><input type="checkbox" checked={chartSettings.showArea} onChange={(event) => setChartSettings((value) => ({ ...value, showArea: event.target.checked }))}/>渐变填充</label>
      </div>
      <button onClick={exportPng}>下载高清PNG</button>
    </section>

    <details className="copy-editor" open>
      <summary>编辑表格与来源文案 <span>修改后立即应用到页面，数据计算结果不会改变</span></summary>
      <div className="copy-editor-grid">
        <label className="copy-editor-wide">数据来源文字<input value={customSourceText} onChange={(event) => setCustomSourceText(event.target.value)} placeholder={`数据来源：${sourceLabel}`} maxLength={120}/></label>
        <label>基准表标题<input value={benchmarkTableTitle} onChange={(event) => setBenchmarkTableTitle(event.target.value)} maxLength={36}/></label>
        <label>同类表标题<input value={peerTableTitle} onChange={(event) => setPeerTableTitle(event.target.value)} maxLength={36}/></label>
        <label className="copy-editor-wide">同类表说明<input value={peerTableSubtitle} onChange={(event) => setPeerTableSubtitle(event.target.value)} maxLength={80}/></label>
      </div>
      <div className="header-editor-group"><strong>基准对比表头</strong><div className="header-editor-row benchmark-header-editor">{benchmarkHeaders.map((value, index) => <input key={index} aria-label={`基准对比表头${index + 1}`} value={value} placeholder={index === 1 ? asset.name : "表头"} onChange={(event) => setBenchmarkHeaders((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/>)}</div></div>
      <div className="header-editor-group"><strong>同类对比表头</strong><div className="header-editor-row peer-header-editor">{peerHeaders.map((value, index) => <input key={index} aria-label={`同类对比表头${index + 1}`} value={value} onChange={(event) => setPeerHeaders((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/>)}</div></div>
      <button className="reset-copy" type="button" onClick={() => { setCustomSourceText(""); setBenchmarkTableTitle("标的与复合基准指标对比"); setBenchmarkHeaders(["指标", "", "复合基准", "相对表现"]); setPeerTableTitle("同类标的横向对比"); setPeerTableSubtitle("同一区间、同一计算口径；滚动胜率按各标的自身有效交易日计算。"); setPeerHeaders(["标的", "区间收益", "年化收益", "最大回撤", "年化波动", "夏普", "季度胜率", "半年胜率", "年度胜率"]); }}>恢复默认文案</button>
    </details>

    <section className={`charts-grid ${status === "loading" ? "is-loading" : ""}`}>
      <article className="chart-card performance-card">
        <div className="chart-report-header"><div><h3>{chartTitle}</h3><p>{asset.name}（{asset.code}）｜{series[0].date}—{series.at(-1)!.date}</p></div><div className="legend"><span className="legend-blue"/>{asset.name}{chartSettings.showBenchmark && <><span className="legend-orange"/>自定义复合基准</>}{resolvedPeers.map((peer, index) => <span className="peer-legend" key={peer.id}><i className={`peer-swatch peer-swatch-${index % 4}`}/>{peer.asset.name}</span>)}</div></div>
        <div className="chart-wrap"><ReportPerformanceChart primary={series} benchmark={benchmarkSeries} peers={resolvedPeers.map((peer) => ({ label: peer.asset.name, series: peer.series }))} primaryLabel={asset.name} benchmarkLabel="复合基准" settings={chartSettings}/></div>
        <div className="figure-source">{sourceCaption}；复合基准：{benchmarkLabel || "未设置"}。观点及测算仅供参考，不构成投资建议。</div>
      </article>
      <article className="chart-card drawdown-card">
        <div className="chart-report-header"><div><h3>区间回撤与修复</h3><p>前高：{analysis.dates.peak}｜谷底：{analysis.dates.trough}｜{analysis.dates.recovered ? `修复：${analysis.dates.recovered}` : "尚未修复"}</p></div><div className="drawdown-summary">标的 <strong>{formatMetric("drawdown", analysis.values.drawdown)}</strong></div></div>
        <div className="chart-wrap"><ReportDrawdownChart primary={analysis.drawdowns} benchmark={analysis.benchmark?.drawdowns} settings={chartSettings}/></div>
        <div className="figure-source">{sourceCaption}；最大回撤按历史峰值至后续低点计算，修复以重新达到前高为准。</div>
      </article>
    </section>

    {analysis.benchmark && <section className="comparison-table"><div className="comparison-heading"><h2>{benchmarkTableTitle}</h2><p>{benchmarkLabel}</p></div><div className="comparison-grid"><div className="comparison-row comparison-header-row">{benchmarkHeaders.map((header, index) => <span key={index}>{header || (index === 1 ? asset.name : "")}</span>)}</div>{(["return", "annualized", "volatility", "drawdown", "sharpe", "calmar"] as MetricId[]).map((id) => { const definition = metricDefinitions.find((item) => item.id === id)!; const assetValue = analysis.values[id]; const benchmarkValue = (analysis.benchmark!.values as Record<string, number | null>)[id]; const difference = assetValue != null && benchmarkValue != null ? assetValue - benchmarkValue : null; return <div className="comparison-row" key={id}><strong>{definition.label}</strong><span>{formatMetric(id, assetValue)}</span><span>{formatMetric(id, benchmarkValue)}</span><span className={difference != null && difference >= 0 ? "positive" : "negative"}>{difference == null ? "—" : formatMetric(id, difference)}</span></div>; })}</div></section>}

    {resolvedPeers.length > 0 && <section className="peer-comparison-table">
      <div className="comparison-heading"><div><h2>{peerTableTitle}</h2><p>{peerTableSubtitle}</p></div><span>{resolvedPeers.length + 1}个标的</span></div>
      <div className="peer-table-scroll"><div className="peer-table-row peer-table-header">{peerHeaders.map((header, index) => <span key={index}>{header}</span>)}</div>
      {[{ id: "primary", asset, analysis, rolling }, ...peerAnalyses].map((item, index) => <div className="peer-table-row" key={item.id}><strong><i className={index === 0 ? "primary-swatch" : `peer-swatch peer-swatch-${(index - 1) % 4}`}/>{item.asset.name}<small>{item.asset.code}</small></strong><span>{formatMetric("return", item.analysis.values.return)}</span><span>{formatMetric("annualized", item.analysis.values.annualized)}</span><span>{formatMetric("drawdown", item.analysis.values.drawdown)}</span><span>{formatMetric("volatility", item.analysis.values.volatility)}</span><span>{formatMetric("sharpe", item.analysis.values.sharpe)}</span><span>{formatPercentValue(item.rolling.quarter.winRate)}</span><span>{formatPercentValue(item.rolling.halfYear.winRate)}</span><span>{formatPercentValue(item.rolling.year.winRate)}</span></div>)}</div>
    </section>}

    <footer><span>ⓘ</span> 数据仅供分析，不构成投资建议。年化指标按252个交易日计；滚动季度、半年和年度分别按63、126、252个交易日估算。</footer>
  </main>;
}

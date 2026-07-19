export type PricePoint = { date: string; value: number };

export type MetricId =
  | "return" | "annualized" | "drawdown" | "recovery"
  | "volatility" | "downsideVolatility" | "sharpe" | "calmar" | "sortino"
  | "winRate" | "positiveMonths" | "var95" | "cvar95" | "maxLoss" | "maxGain"
  | "skewness" | "kurtosis" | "excessReturn" | "alpha" | "beta"
  | "trackingError" | "informationRatio" | "correlation" | "upCapture" | "downCapture";

export const metricDefinitions: { id: MetricId; label: string; compact: string; group: "收益" | "风险" | "相对基准" }[] = [
  { id: "return", label: "区间收益", compact: "区间收益", group: "收益" },
  { id: "annualized", label: "年化收益", compact: "年化收益", group: "收益" },
  { id: "drawdown", label: "最大回撤", compact: "最大回撤", group: "风险" },
  { id: "recovery", label: "回撤修复", compact: "修复天数", group: "风险" },
  { id: "volatility", label: "年化波动率", compact: "年化波动", group: "风险" },
  { id: "downsideVolatility", label: "下行波动率", compact: "下行波动", group: "风险" },
  { id: "sharpe", label: "夏普比率", compact: "夏普比率", group: "收益" },
  { id: "calmar", label: "卡玛比率", compact: "卡玛比率", group: "收益" },
  { id: "sortino", label: "索提诺比率", compact: "索提诺", group: "收益" },
  { id: "winRate", label: "上涨交易日占比", compact: "日度胜率", group: "收益" },
  { id: "positiveMonths", label: "正收益月份占比", compact: "月度胜率", group: "收益" },
  { id: "var95", label: "95%单日VaR", compact: "VaR 95%", group: "风险" },
  { id: "cvar95", label: "95%条件VaR", compact: "CVaR 95%", group: "风险" },
  { id: "maxLoss", label: "最大单日跌幅", compact: "最大单日跌幅", group: "风险" },
  { id: "maxGain", label: "最大单日涨幅", compact: "最大单日涨幅", group: "收益" },
  { id: "skewness", label: "日收益偏度", compact: "偏度", group: "风险" },
  { id: "kurtosis", label: "日收益峰度", compact: "峰度", group: "风险" },
  { id: "excessReturn", label: "区间超额收益", compact: "超额收益", group: "相对基准" },
  { id: "alpha", label: "年化Alpha", compact: "Alpha", group: "相对基准" },
  { id: "beta", label: "Beta", compact: "Beta", group: "相对基准" },
  { id: "trackingError", label: "年化跟踪误差", compact: "跟踪误差", group: "相对基准" },
  { id: "informationRatio", label: "信息比率", compact: "信息比率", group: "相对基准" },
  { id: "correlation", label: "基准相关系数", compact: "相关系数", group: "相对基准" },
  { id: "upCapture", label: "上涨捕获率", compact: "上涨捕获", group: "相对基准" },
  { id: "downCapture", label: "下跌捕获率", compact: "下跌捕获", group: "相对基准" },
];

export const defaultMetrics: MetricId[] = [
  "return", "annualized", "drawdown", "recovery", "volatility", "sharpe", "calmar",
  "excessReturn", "beta", "informationRatio",
];

export const percentMetrics = new Set<MetricId>([
  "return", "annualized", "drawdown", "volatility", "downsideVolatility", "winRate",
  "positiveMonths", "var95", "cvar95", "maxLoss", "maxGain", "excessReturn", "alpha",
  "trackingError", "upCapture", "downCapture",
]);

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function standardDeviation(values: number[]) { return Math.sqrt(variance(values)); }

function covariance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;
  const a = left.slice(-length);
  const b = right.slice(-length);
  const ma = mean(a);
  const mb = mean(b);
  return a.reduce((sum, value, index) => sum + (value - ma) * (b[index] - mb), 0) / (length - 1);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function distributionShape(values: number[]) {
  const n = values.length;
  const average = mean(values);
  const sd = standardDeviation(values);
  if (n < 4 || !sd) return { skewness: 0, kurtosis: 0 };
  const z = values.map((value) => (value - average) / sd);
  const skewness = (n / ((n - 1) * (n - 2))) * z.reduce((sum, value) => sum + value ** 3, 0);
  const kurtosis =
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * z.reduce((sum, value) => sum + value ** 4, 0)
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return { skewness, kurtosis };
}

function baseAnalysis(series: PricePoint[], riskFreeRate: number) {
  const first = series[0]?.value ?? 1;
  const last = series.at(-1)?.value ?? first;
  const returns = series.slice(1).map((point, index) => point.value / series[index].value - 1);
  const days = Math.max(1, (new Date(series.at(-1)?.date ?? 0).getTime() - new Date(series[0]?.date ?? 0).getTime()) / 86_400_000);
  const intervalReturn = last / first - 1;
  const annualized = Math.pow(last / first, 365.25 / days) - 1;
  const volatility = standardDeviation(returns) * Math.sqrt(252);
  const targetDaily = Math.pow(1 + riskFreeRate, 1 / 252) - 1;
  const downsideVolatility = Math.sqrt(mean(returns.map((value) => Math.min(0, value - targetDaily) ** 2))) * Math.sqrt(252);

  let peak = first;
  let peakIndex = 0;
  let maxDrawdown = 0;
  let drawdownPeakIndex = 0;
  let troughIndex = 0;
  const drawdowns = series.map((point, index) => {
    if (point.value > peak) { peak = point.value; peakIndex = index; }
    const value = point.value / peak - 1;
    if (value < maxDrawdown) { maxDrawdown = value; drawdownPeakIndex = peakIndex; troughIndex = index; }
    return { date: point.date, value };
  });
  const preDrawdownPeak = series[drawdownPeakIndex]?.value ?? first;
  const recoveredAt = series.findIndex((point, index) => index > troughIndex && point.value >= preDrawdownPeak);
  const recovery = recoveredAt >= 0 ? recoveredAt - drawdownPeakIndex : null;
  const monthly = new Map<string, number[]>();
  series.forEach((point) => {
    const key = point.date.slice(0, 7);
    monthly.set(key, [...(monthly.get(key) ?? []), point.value]);
  });
  const monthReturns = [...monthly.values()].filter((values) => values.length > 1).map((values) => values.at(-1)! / values[0] - 1);
  const activeDays = returns.filter((value) => value !== 0);
  const valueAtRisk = percentile(returns, 0.05);
  const tail = returns.filter((value) => value <= valueAtRisk);
  const shape = distributionShape(returns);

  return {
    returns,
    drawdowns,
    dates: { peak: series[drawdownPeakIndex]?.date, trough: series[troughIndex]?.date, recovered: recoveredAt >= 0 ? series[recoveredAt]?.date : null },
    values: {
      return: intervalReturn, annualized, drawdown: maxDrawdown, recovery,
      volatility, downsideVolatility,
      sharpe: volatility ? (annualized - riskFreeRate) / volatility : 0,
      calmar: maxDrawdown ? annualized / Math.abs(maxDrawdown) : 0,
      sortino: downsideVolatility ? (annualized - riskFreeRate) / downsideVolatility : 0,
      winRate: activeDays.length ? activeDays.filter((value) => value > 0).length / activeDays.length : 0,
      positiveMonths: monthReturns.length ? monthReturns.filter((value) => value > 0).length / monthReturns.length : 0,
      var95: valueAtRisk,
      cvar95: tail.length ? mean(tail) : valueAtRisk,
      maxLoss: Math.min(0, ...returns),
      maxGain: Math.max(0, ...returns),
      skewness: shape.skewness,
      kurtosis: shape.kurtosis,
    },
  };
}

export function calculate(series: PricePoint[], riskFreeRate: number, benchmark?: PricePoint[]) {
  const asset = baseAnalysis(series, riskFreeRate);
  const benchmarkBase = benchmark?.length ? baseAnalysis(benchmark, riskFreeRate) : null;
  const values: Record<MetricId, number | null> = {
    ...asset.values,
    excessReturn: null, alpha: null, beta: null, trackingError: null,
    informationRatio: null, correlation: null, upCapture: null, downCapture: null,
  };

  if (benchmarkBase) {
    const length = Math.min(asset.returns.length, benchmarkBase.returns.length);
    const assetReturns = asset.returns.slice(-length);
    const benchmarkReturns = benchmarkBase.returns.slice(-length);
    const benchmarkVariance = variance(benchmarkReturns);
    const beta = benchmarkVariance ? covariance(assetReturns, benchmarkReturns) / benchmarkVariance : 0;
    const dailyRf = Math.pow(1 + riskFreeRate, 1 / 252) - 1;
    const alpha = (mean(assetReturns) - dailyRf - beta * (mean(benchmarkReturns) - dailyRf)) * 252;
    const excessReturns = assetReturns.map((value, index) => value - benchmarkReturns[index]);
    const trackingError = standardDeviation(excessReturns) * Math.sqrt(252);
    const correlation = standardDeviation(assetReturns) && standardDeviation(benchmarkReturns)
      ? covariance(assetReturns, benchmarkReturns) / (standardDeviation(assetReturns) * standardDeviation(benchmarkReturns))
      : 0;
    const upIndexes = benchmarkReturns.map((value, index) => value > 0 ? index : -1).filter((index) => index >= 0);
    const downIndexes = benchmarkReturns.map((value, index) => value < 0 ? index : -1).filter((index) => index >= 0);
    const capture = (indexes: number[]) => {
      const benchmarkMean = mean(indexes.map((index) => benchmarkReturns[index]));
      return benchmarkMean ? mean(indexes.map((index) => assetReturns[index])) / benchmarkMean : 0;
    };
    values.excessReturn = asset.values.return - benchmarkBase.values.return;
    values.alpha = alpha;
    values.beta = beta;
    values.trackingError = trackingError;
    values.informationRatio = trackingError ? (asset.values.annualized - benchmarkBase.values.annualized) / trackingError : 0;
    values.correlation = correlation;
    values.upCapture = capture(upIndexes);
    values.downCapture = capture(downIndexes);
  }

  return { ...asset, values, benchmark: benchmarkBase };
}

export function formatMetric(id: MetricId, value: number | null) {
  if (value == null) return "—";
  if (id === "recovery") return `${Math.round(value)}个交易日`;
  if (percentMetrics.has(id)) return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
  return value.toFixed(2);
}

export function composeBenchmark(primary: PricePoint[], components: { series: PricePoint[]; weight: number }[]) {
  if (!components.length) return { primary, benchmark: [] as PricePoint[] };
  const commonStart = [primary[0].date, ...components.map((component) => component.series[0].date)].sort().at(-1)!;
  const commonEnd = [primary.at(-1)!.date, ...components.map((component) => component.series.at(-1)!.date)].sort()[0];
  const alignedPrimary = primary.filter((point) => point.date >= commonStart && point.date <= commonEnd);
  const pointers = components.map(() => 0);
  const lastValues = components.map(() => 0);
  const benchmark: PricePoint[] = [];
  let compositeValue = 1;

  alignedPrimary.forEach((point, dayIndex) => {
    const componentReturns = components.map((component, index) => {
      while (pointers[index] + 1 < component.series.length && component.series[pointers[index] + 1].date <= point.date) pointers[index] += 1;
      const current = component.series[pointers[index]].value;
      const dailyReturn = dayIndex === 0 || !lastValues[index] ? 0 : current / lastValues[index] - 1;
      lastValues[index] = current;
      return dailyReturn;
    });
    if (dayIndex > 0) compositeValue *= 1 + componentReturns.reduce((sum, value, index) => sum + value * components[index].weight, 0);
    benchmark.push({ date: point.date, value: compositeValue });
  });
  return { primary: alignedPrimary, benchmark };
}

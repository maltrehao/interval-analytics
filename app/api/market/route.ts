type AssetKind = "auto" | "fund" | "stock" | "index";

type BaiduSearchRow = {
  code?: string;
  name?: string;
  type?: string;
  subType?: string;
  exchange?: string;
  market?: string;
};

type AssetCandidate = {
  code: string;
  name: string;
  kind: Exclude<AssetKind, "auto">;
  kindLabel: string;
  exchange?: string;
  secid?: string;
};

type PricePoint = { date: string; value: number };

const OPEN_BOND_INDEXES: AssetCandidate[] = [
  { code: "000985", name: "中证全A（中证全指）", kind: "index", kindLabel: "指数", exchange: "SH", secid: "1.000985" },
  { code: "000012", name: "国债指数", kind: "index", kindLabel: "指数", exchange: "SH", secid: "1.000012" },
  { code: "399481", name: "企债指数", kind: "index", kindLabel: "指数", exchange: "SZ", secid: "0.399481" },
];

function kindLabel(kind: Exclude<AssetKind, "auto">) {
  return kind === "fund" ? "基金" : kind === "index" ? "指数" : "股票";
}

function normalizeKind(value: string | null): AssetKind {
  return value === "fund" || value === "stock" || value === "index" ? value : "auto";
}

function secidFor(exchange: string | undefined, code: string) {
  if (exchange === "SH") return `1.${code}`;
  if (exchange === "SZ" || exchange === "BJ") return `0.${code}`;
  if (exchange === "HK") return `116.${code}`;
  return undefined;
}

function baiduKind(row: BaiduSearchRow): Exclude<AssetKind, "auto"> | null {
  const value = `${row.type ?? ""} ${row.subType ?? ""}`.toLowerCase();
  if (/fund|etf|lof/.test(value) || row.exchange === "FD") return "fund";
  if (/index/.test(value)) return "index";
  if (/stock/.test(value)) return "stock";
  return null;
}

async function fetchJson(url: string, headers: HeadersInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", ...headers },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`上游数据服务返回 ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`上游搜索服务返回 ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function searchBaidu(query: string): Promise<AssetCandidate[]> {
  const url = new URL("https://finance.pae.baidu.com/selfselect/sug");
  url.searchParams.set("wd", query);
  url.searchParams.set("skip_login", "1");
  url.searchParams.set("finClientType", "pc");
  const json = await fetchJson(url.toString(), { Referer: "https://gushitong.baidu.com/" });
  const rows: BaiduSearchRow[] = json?.Result?.stock ?? [];
  return rows.flatMap((row) => {
    const code = row.code?.trim();
    const name = row.name?.trim();
    const kind = baiduKind(row);
    const exchange = row.exchange?.toUpperCase();
    if (!code || !name || !kind || !["SH", "SZ", "BJ", "HK", "FD"].includes(exchange ?? "")) return [];
    return [{ code, name, kind, kindLabel: kindLabel(kind), exchange, secid: secidFor(exchange, code) }];
  });
}

async function searchTencent(query: string): Promise<AssetCandidate[]> {
  const url = new URL("https://smartbox.gtimg.cn/s3/");
  url.searchParams.set("q", query);
  url.searchParams.set("t", "all");
  const body = await fetchText(url.toString());
  const match = body.match(/v_hint=("(?:[^"\\]|\\.)*")/);
  if (!match) return [];
  const decoded = JSON.parse(match[1]) as string;
  if (!decoded || decoded === "N") return [];
  return decoded.split("^").flatMap((record) => {
    const [market, code, name, , type = ""] = record.split("~");
    if (!code || !name) return [];
    const exchange = market === "sh" ? "SH" : market === "sz" ? "SZ" : market === "jj" ? "FD" : undefined;
    if (!exchange) return [];
    const kind: Exclude<AssetKind, "auto"> = /ZS/i.test(type) ? "index" : /ETF|LOF|KJ|JJ/i.test(type) || market === "jj" ? "fund" : "stock";
    return [{ code, name, kind, kindLabel: kindLabel(kind), exchange, secid: secidFor(exchange, code) }];
  });
}

function rankCandidate(candidate: AssetCandidate, query: string) {
  const needle = query.toLowerCase();
  const code = candidate.code.toLowerCase();
  const name = candidate.name.toLowerCase();
  return (code === needle ? 100 : 0) + (name === needle ? 90 : 0) +
    (code.startsWith(needle) ? 30 : 0) + (name.startsWith(needle) ? 25 : 0) +
    (name.includes(needle) ? 10 : 0);
}

async function searchAssets(query: string, requested: AssetKind) {
  const openIndexes = OPEN_BOND_INDEXES.filter((item) => item.code.includes(query) || item.name.includes(query));
  const matchesKind = (item: AssetCandidate) => requested === "auto" || item.kind === requested;
  const queryProvider = (promise: Promise<AssetCandidate[]>) => promise.then((items) => {
    const filtered = items.filter(matchesKind);
    if (!filtered.length) throw new Error("该搜索源没有匹配结果");
    return filtered;
  });
  const external = openIndexes.some(matchesKind)
    ? []
    : await Promise.any([queryProvider(searchBaidu(query)), queryProvider(searchTencent(query))]).catch(() => [] as AssetCandidate[]);
  const combined = [...openIndexes, ...external];
  const seen = new Set<string>();
  return combined
    .filter(matchesKind)
    .filter((item) => {
      const key = `${item.exchange}:${item.code}:${item.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rankCandidate(b, query) - rankCandidate(a, query))
    .slice(0, 12);
}

async function getFund(code: string, start: string, end: string) {
  try {
    const body = await fetchText(`https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js`);
    const match = body.match(/var Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    const rows: { x?: number; y?: number }[] = match ? JSON.parse(match[1]) : [];
    const series = rows
      .map((row) => ({
        date: typeof row.x === "number" ? new Date(row.x).toISOString().slice(0, 10) : "",
        value: Number(row.y),
      }))
      .filter((row) => row.date >= start && row.date <= end && Number.isFinite(row.value) && row.value > 0);
    if (series.length >= 2) return series;
  } catch {
    // Continue with the paged NAV endpoint when the full-history script is unavailable.
  }
  const url = new URL("https://api.fund.eastmoney.com/f10/lsjz");
  url.searchParams.set("fundCode", code);
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);
  const json = await fetchJson(url.toString(), {
    Referer: `https://fundf10.eastmoney.com/jjjz_${code}.html`,
  });
  const rows = json?.Data?.LSJZList ?? [];
  const series: PricePoint[] = rows
    .map((row: { FSRQ?: string; DWJZ?: string }) => ({ date: row.FSRQ ?? "", value: Number(row.DWJZ) }))
    .filter((row: PricePoint) => row.date && Number.isFinite(row.value) && row.value > 0)
    .sort((a: PricePoint, b: PricePoint) => a.date.localeCompare(b.date));
  if (series.length < 2) throw new Error("该区间内未找到足够的基金净值数据");
  return series;
}

async function getMarket(secid: string, start: string, end: string) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", secid);
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", start.replaceAll("-", ""));
  url.searchParams.set("end", end.replaceAll("-", ""));
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  const json = await fetchJson(url.toString());
  const klines: string[] = json?.data?.klines ?? [];
  const series = klines
    .map((line) => { const fields = line.split(","); return { date: fields[0], value: Number(fields[2]) }; })
    .filter((row) => row.date && Number.isFinite(row.value) && row.value > 0);
  if (series.length < 2) throw new Error("该区间内未找到足够的行情数据");
  return { series, name: json?.data?.name as string | undefined, source: "东方财富公开行情" };
}

async function getSinaMarket(candidate: AssetCandidate, start: string, end: string) {
  if (candidate.exchange !== "SH" && candidate.exchange !== "SZ") {
    throw new Error("该市场暂时没有可用的备用行情源");
  }
  const symbol = candidate.kind === "index" && candidate.code === "000300"
    ? "sz399300"
    : `${candidate.exchange.toLowerCase()}${candidate.code}`;
  const url = new URL("https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20intervalData/CN_MarketDataService.getKLineData");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("scale", "240");
  url.searchParams.set("ma", "no");
  url.searchParams.set("datalen", "1023");
  const body = await fetchText(url.toString());
  const match = body.match(/var intervalData\((\[[\s\S]*\]|null)\);?\s*$/);
  const rows: { day?: string; close?: string }[] = match && match[1] !== "null" ? JSON.parse(match[1]) : [];
  const series = rows
    .map((row) => ({ date: row.day ?? "", value: Number(row.close) }))
    .filter((row) => row.date >= start && row.date <= end && Number.isFinite(row.value) && row.value > 0);
  if (series.length < 2) throw new Error("该区间内未找到足够的备用行情数据");
  return { series, name: candidate.name, source: "新浪公开行情（备用源，最多约1023个交易日）" };
}

function fallbackSecid(code: string) {
  return `${/^(5|6|9)/.test(code) ? "1" : "0"}.${code}`;
}

function candidateFromRequest(searchParams: URLSearchParams): AssetCandidate | null {
  const code = (searchParams.get("code") ?? "").trim();
  const name = (searchParams.get("name") ?? "").trim();
  const kind = normalizeKind(searchParams.get("resolvedKind"));
  if (!code || kind === "auto") return null;
  const exchange = (searchParams.get("exchange") ?? "").trim().toUpperCase() || undefined;
  const secid = (searchParams.get("secid") ?? "").trim() || secidFor(exchange, code);
  return { code, name: name || code, kind, kindLabel: kindLabel(kind), exchange, secid };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  const requested = normalizeKind(searchParams.get("kind"));

  if (searchParams.get("action") === "search") {
    if (!query) return Response.json({ results: [] });
    try {
      return Response.json({ results: await searchAssets(query, requested) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "搜索服务暂时不可用";
      return Response.json({ error: message, results: [] }, { status: 502 });
    }
  }

  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  if (!query || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return Response.json({ error: "请提供标的、开始日期和结束日期" }, { status: 400 });
  }
  if (start >= end) return Response.json({ error: "结束日期必须晚于开始日期" }, { status: 400 });

  try {
    const supplied = candidateFromRequest(searchParams);
    const match = supplied ?? (await searchAssets(query, requested))[0] ?? null;
    const code = match?.code ?? (/^\d{6}$/.test(query) ? query : "");
    if (!code) throw new Error("未找到该标的，请从搜索候选中选择，或输入完整六位代码");
    const kind = match?.kind ?? requested;
    const exchange = match?.exchange;

    if (kind === "fund" && (!exchange || exchange === "FD")) {
      const series = await getFund(code, start, end);
      return Response.json({
        asset: { code, name: match?.name ?? code, kind: "fund", kindLabel: "基金", exchange: "FD" },
        source: "天天基金公开净值",
        series,
      });
    }

    if (!match && requested === "auto") {
      try {
        const series = await getFund(code, start, end);
        return Response.json({
          asset: { code, name: code, kind: "fund", kindLabel: "基金", exchange: "FD" },
          source: "天天基金公开净值",
          series,
        });
      } catch {
        // If it is not an off-exchange fund, continue with exchange history.
      }
    }

    const secid = match?.secid ?? secidFor(exchange, code) ?? fallbackSecid(code);
    const marketCandidate: AssetCandidate = match ?? {
      code,
      name: code,
      kind: kind === "index" ? "index" : kind === "fund" ? "fund" : "stock",
      kindLabel: kindLabel(kind === "index" ? "index" : kind === "fund" ? "fund" : "stock"),
      exchange: /^(5|6|9)/.test(code) ? "SH" : "SZ",
      secid,
    };
    const market = await getMarket(secid, start, end).catch(() => getSinaMarket(marketCandidate, start, end));
    const resolvedKind = kind === "index" || requested === "index" ? "index" : kind === "fund" ? "fund" : "stock";
    return Response.json({
      asset: {
        code,
        name: match?.name ?? market.name ?? code,
        kind: resolvedKind,
        kindLabel: kindLabel(resolvedKind),
        exchange,
        secid,
      },
      source: market.source,
      series: market.series,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "行情获取失败";
    return Response.json({ error: message }, { status: 502 });
  }
}

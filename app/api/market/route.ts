type AssetKind = "auto" | "fund" | "stock" | "index";

type SearchRow = {
  Code?: string;
  Name?: string;
  MktNum?: string | number;
  QuoteID?: string;
  SecurityTypeName?: string;
  SecurityType?: string;
  Type?: string;
};

type PricePoint = { date: string; value: number };

const SEARCH_TOKEN = process.env.EASTMONEY_SEARCH_TOKEN ?? "";

function asKind(row: SearchRow): Exclude<AssetKind, "auto"> {
  const label = `${row.SecurityTypeName ?? ""} ${row.SecurityType ?? ""} ${row.Type ?? ""}`;
  if (/基金|ETF|LOF/i.test(label)) return "fund";
  if (/指数/i.test(label)) return "index";
  return "stock";
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

async function searchAsset(query: string, requested: AssetKind) {
  if (!SEARCH_TOKEN) {
    throw new Error("未配置名称搜索服务，请输入证券代码或设置 EASTMONEY_SEARCH_TOKEN");
  }
  const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  url.searchParams.set("input", query);
  url.searchParams.set("type", "14");
  url.searchParams.set("token", SEARCH_TOKEN);
  url.searchParams.set("count", "20");
  const json = await fetchJson(url.toString());
  const rows: SearchRow[] = json?.QuotationCodeTable?.Data ?? [];
  const filtered = requested === "auto" ? rows : rows.filter((row) => asKind(row) === requested);
  const ranked = [...filtered].sort((a, b) => {
    const score = (row: SearchRow) =>
      (row.Code === query ? 4 : 0) +
      (row.Name === query ? 5 : 0) +
      (row.Name?.includes(query) ? 2 : 0);
    return score(b) - score(a);
  });
  return ranked[0] ?? null;
}

async function getFund(code: string, start: string, end: string) {
  const url = new URL("https://api.fund.eastmoney.com/f10/lsjz");
  url.searchParams.set("fundCode", code);
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", "10000");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);
  const json = await fetchJson(url.toString(), {
    Referer: `https://fundf10.eastmoney.com/jjjz_${code}.html`,
  });
  const rows = json?.Data?.LSJZList ?? [];
  const series: PricePoint[] = rows
    .map((row: { FSRQ?: string; DWJZ?: string }) => ({
      date: row.FSRQ ?? "",
      value: Number(row.DWJZ),
    }))
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
    .map((line) => {
      const fields = line.split(",");
      return { date: fields[0], value: Number(fields[2]) };
    })
    .filter((row) => row.date && Number.isFinite(row.value) && row.value > 0);
  if (series.length < 2) throw new Error("该区间内未找到足够的行情数据");
  return { series, name: json?.data?.name as string | undefined };
}

function fallbackSecid(code: string) {
  return `${/^(5|6|9)/.test(code) ? "1" : "0"}.${code}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const requested = (searchParams.get("kind") ?? "auto") as AssetKind;

  if (!query || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return Response.json({ error: "请提供标的、开始日期和结束日期" }, { status: 400 });
  }
  if (start >= end) return Response.json({ error: "结束日期必须晚于开始日期" }, { status: 400 });

  try {
    const match = await searchAsset(query, requested).catch(() => null);
    const code = match?.Code ?? (/^\d{6}$/.test(query) ? query : "");
    if (!code) throw new Error("未识别该标的，请尝试输入完整代码或名称");
    const kind = match ? asKind(match) : requested;

    if (kind === "fund" || requested === "fund") {
      const series = await getFund(code, start, end);
      return Response.json({
        asset: { code, name: match?.Name ?? code, kind: "fund", kindLabel: "基金" },
        source: "天天基金公开净值",
        series,
      });
    }

    if (!match && requested === "auto") {
      try {
        const series = await getFund(code, start, end);
        return Response.json({
          asset: { code, name: code, kind: "fund", kindLabel: "基金" },
          source: "天天基金公开净值",
          series,
        });
      } catch {
        // Continue with exchange history when the code is not a fund.
      }
    }

    const secid = match?.QuoteID ?? (match?.MktNum != null ? `${match.MktNum}.${code}` : fallbackSecid(code));
    const market = await getMarket(secid, start, end);
    const resolvedKind = kind === "index" || requested === "index" ? "index" : "stock";
    return Response.json({
      asset: {
        code,
        name: match?.Name ?? market.name ?? code,
        kind: resolvedKind,
        kindLabel: resolvedKind === "index" ? "指数" : "股票",
      },
      source: "东方财富公开行情",
      series: market.series,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "行情获取失败";
    return Response.json({ error: message }, { status: 502 });
  }
}

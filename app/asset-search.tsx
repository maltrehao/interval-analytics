"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AssetKind = "auto" | "fund" | "stock" | "index";

export type AssetCandidate = {
  code: string;
  name: string;
  kind: Exclude<AssetKind, "auto">;
  kindLabel: string;
  exchange?: string;
  secid?: string;
};

export function assetDisplay(asset: AssetCandidate) {
  return `${asset.name}（${asset.code}）`;
}

type Props = {
  value: string;
  kind: AssetKind;
  selected?: AssetCandidate | null;
  placeholder?: string;
  onValueChange(value: string): void;
  onSelect(asset: AssetCandidate): void;
  onSubmit?(): void;
  compact?: boolean;
};

export function AssetSearchInput({
  value, kind, selected, placeholder, onValueChange, onSelect, onSubmit, compact = false,
}: Props) {
  const listId = useId();
  const requestId = useRef(0);
  const focused = useRef(false);
  const [results, setResults] = useState<AssetCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const query = value.trim();
    if (!query || (selected && query === assetDisplay(selected))) {
      const resetTimer = window.setTimeout(() => {
        setResults([]);
        setOpen(false);
        setLoading(false);
        setMessage("");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        const params = new URLSearchParams({ action: "search", query, kind });
        const response = await fetch(`/api/market?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const json = await response.json() as { results?: AssetCandidate[]; error?: string };
        if (currentRequest !== requestId.current) return;
        const items = response.ok ? (json.results ?? []) : [];
        setResults(items);
        setMessage(items.length ? "" : (json.error ?? "没有匹配结果，可尝试完整代码或切换类型"));
        setOpen(focused.current);
      } catch (error) {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        setResults([]);
        setMessage(error instanceof Error ? error.message : "搜索服务暂时不可用");
        setOpen(focused.current);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, selected, value]);

  const choose = (asset: AssetCandidate) => {
    requestId.current += 1;
    setOpen(false);
    setResults([]);
    setMessage("");
    onSelect(asset);
  };

  return <div className={`asset-search ${compact ? "asset-search-compact" : ""}`}>
    <input
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onFocus={() => { focused.current = true; if (results.length || message) setOpen(true); }}
      onBlur={() => { focused.current = false; window.setTimeout(() => setOpen(false), 150); }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (open && results[0]) choose(results[0]);
        else onSubmit?.();
      }}
      placeholder={placeholder ?? "输入名称、代码或简称"}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
    />
    {loading && <span className="searching-indicator" aria-label="搜索中"/>}
    {open && <div className="search-results" id={listId} role="listbox">
      {results.map((item) => <button
        key={`${item.exchange ?? ""}-${item.code}-${item.kind}`}
        type="button"
        role="option"
        aria-selected={selected?.code === item.code && selected?.exchange === item.exchange}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(item)}
      >
        <span><strong>{item.name}</strong><small>{item.code}{item.exchange ? ` · ${item.exchange}` : ""}</small></span>
        <em>{item.kindLabel}</em>
      </button>)}
      {!results.length && message && <p>{message}</p>}
    </div>}
  </div>;
}

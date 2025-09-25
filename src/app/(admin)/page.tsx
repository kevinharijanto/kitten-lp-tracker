"use client";

import React, { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

interface KittenswapPosition {
  poolName: string;
  totalValueUsd: number;
  sharePercent?: number;
  tokenAmounts: Record<string, number>;
  accruedFeesUsd?: number;
  accruedFeesTokens: Record<string, number>;
  rewardKitten?: number;
  rewardKittenUsd?: number;
  priceLower?: number;
  priceUpper?: number;
  priceCurrent?: number;
  tickLower?: number;
  tickUpper?: number;
  inRange: boolean;
  isActive: boolean;
  lastUpdated?: string;
}

interface ApiResponse {
  protocol?: string;
  network?: string;
  positions?: KittenswapPosition[];
  error?: string;
  details?: string;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e6)) {
    return value.toExponential(2);
  }
  return numberFormatter.format(value);
}

export default function HyperliquidKittenswapPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [positions, setPositions] = useState<KittenswapPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const isValidWallet = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

  const handleTrackWallet = async () => {
    if (!walletAddress.trim()) {
      setError("Please enter a wallet address.");
      return;
    }

    if (!isValidWallet(walletAddress)) {
      setError("Wallet must be a valid 0x-prefixed Hyperliquid address.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/hyperliquid/kittenswap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletAddress.trim() }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        setPositions([]);
        setLastUpdated(null);
        setError(data?.error || data?.details || "Failed to fetch LP data.");
        return;
      }

      setPositions(data.positions ?? []);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to fetch LP information."
      );
      setPositions([]);
      setLastUpdated(null);
    } finally {
      setIsLoading(false);
    }
  };

  const totalValueUsd = useMemo(
    () => positions.reduce((sum, position) => sum + (position.totalValueUsd || 0), 0),
    [positions]
  );

  const totalAccruedFeesUsd = useMemo(
    () => positions.reduce((sum, position) => sum + (position.accruedFeesUsd || 0), 0),
    [positions]
  );

  const kittenRewards = useMemo(() => {
    return positions.reduce(
      (acc, position) => {
        if (typeof position.rewardKitten === "number") {
          acc.kitten += position.rewardKitten;
        }
        if (typeof position.rewardKittenUsd === "number") {
          acc.usd += position.rewardKittenUsd;
        }
        return acc;
      },
      { kitten: 0, usd: 0 }
    );
  }, [positions]);

  const activePools = useMemo(
    () => positions.filter((position) => position.isActive).length,
    [positions]
  );

  const tokenTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const position of positions) {
      for (const [symbol, amount] of Object.entries(position.tokenAmounts || {})) {
        if (!Number.isFinite(amount)) continue;
        totals[symbol] = (totals[symbol] || 0) + amount;
      }
    }
    return totals;
  }, [positions]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Kittenswap LP Tracker (Hyperliquid)
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Enter a Hyperliquid wallet address to fetch active Kittenswap LP positions.
        </p>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <input
            name="walletAddress"
            type="text"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x..."
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={handleTrackWallet}
            disabled={isLoading}
            className="rounded-md bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Checking..." : "Check Positions"}
          </button>
        </div>
        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
        {lastUpdated && !error && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Last refreshed: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
            {currencyFormatter.format(totalValueUsd)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">Accrued Fees</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
            {currencyFormatter.format(totalAccruedFeesUsd)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">Kitten Rewards</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
            {kittenRewards.kitten > 0
              ? `${kittenRewards.kitten.toLocaleString(undefined, { maximumFractionDigits: 4 })} KITTEN`
              : "-"}
          </p>
          {kittenRewards.usd > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ≈ {currencyFormatter.format(kittenRewards.usd)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">Active Pools</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white/90">
            {activePools}/{positions.length}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Token Exposure
        </h2>
        {positions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            No Kittenswap LP positions found for this wallet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(tokenTotals)
              .sort(([, amountA], [, amountB]) => amountB - amountA)
              .map(([symbol, amount]) => (
                <div
                  key={symbol}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200"
                >
                  <p className="font-medium">{symbol}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">
                    {amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </p>
                </div>
              ))}
          </div>
        )}
      </section>

      {positions.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Position Graphics</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {positions.map((position) => {
              const lower = position.priceLower ?? 0;
              const upper = position.priceUpper ?? 0;
              const current = position.priceCurrent ?? 0;
              const span = upper - lower;
              const currentPercent = span > 0 ? ((current - lower) / span) * 100 : current >= upper ? 100 : 0;
              const clampedCurrent = Math.max(0, Math.min(100, currentPercent));
              const statusLabel = position.isActive
                ? position.inRange
                  ? "Active • In Range"
                  : "Active • Out of Range"
                : "Inactive";

              return (
                <div
                  key={`${position.poolName}-graphic`}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{position.poolName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</p>
                    </div>
                    <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                      <p>{currencyFormatter.format(position.totalValueUsd ?? 0)}</p>
                      {typeof position.rewardKitten === "number" && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Kitten rewards: {position.rewardKitten.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatPrice(position.priceLower)}</span>
                      <span>{formatPrice(position.priceUpper)}</span>
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full ${
                          position.inRange ? "bg-brand-500" : "bg-red-500"
                        }`}
                        style={{ left: `${clampedCurrent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Current price: {formatPrice(position.priceCurrent)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {positions.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Kittenswap LP Positions
          </h2>
          <div className="mt-4 overflow-x-auto">
            <Table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <TableHeader className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                <TableRow>
                  <TableCell isHeader className="px-4 py-3">Pool</TableCell>
                  <TableCell isHeader className="px-4 py-3">Status</TableCell>
                  <TableCell isHeader className="px-4 py-3">Total Value</TableCell>
                  <TableCell isHeader className="px-4 py-3">Rewards (Tokens)</TableCell>
                  <TableCell isHeader className="px-4 py-3">Kitten Rewards</TableCell>
                  <TableCell isHeader className="px-4 py-3">Kitten Rewards (USD)</TableCell>
                  <TableCell isHeader className="px-4 py-3">Accrued Fees (USD)</TableCell>
                  <TableCell isHeader className="px-4 py-3">Token Amounts</TableCell>
                  <TableCell isHeader className="px-4 py-3">Price Range</TableCell>
                  <TableCell isHeader className="px-4 py-3">Last Update</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {positions.map((position) => (
                  <TableRow
                    key={`${position.poolName}-${position.lastUpdated ?? "unknown"}`}
                    className="text-sm text-gray-800 dark:text-gray-200"
                  >
                    <TableCell className="px-4 py-3 font-medium">{position.poolName}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            position.isActive
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                              : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {position.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {position.inRange ? "In Range" : "Out of Range"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {currencyFormatter.format(position.totalValueUsd ?? 0)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(position.accruedFeesTokens || {}).map(([symbol, amount]) => (
                          <span
                            key={`${position.poolName}-${symbol}-fees`}
                            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          >
                            {symbol}: {amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </span>
                        ))}
                        {Object.keys(position.accruedFeesTokens || {}).length === 0 && <span>-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {position.rewardKitten !== undefined
                        ? `${position.rewardKitten.toLocaleString(undefined, { maximumFractionDigits: 6 })} KITTEN`
                        : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {position.rewardKittenUsd !== undefined
                        ? currencyFormatter.format(position.rewardKittenUsd)
                        : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {position.accruedFeesUsd !== undefined
                        ? currencyFormatter.format(position.accruedFeesUsd)
                        : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(position.tokenAmounts || {}).map(([symbol, amount]) => (
                          <span
                            key={`${position.poolName}-${symbol}`}
                            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          >
                            {symbol}: {amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </span>
                        ))}
                        {Object.keys(position.tokenAmounts || {}).length === 0 && <span>-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          Range: {formatPrice(position.priceLower)} – {formatPrice(position.priceUpper)}
                        </span>
                        <span>Current: {formatPrice(position.priceCurrent)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {position.lastUpdated
                        ? new Date(position.lastUpdated).toLocaleString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

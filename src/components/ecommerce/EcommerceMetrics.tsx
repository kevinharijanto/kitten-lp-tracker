"use client";
import React from "react";
import Badge from "../ui/badge/Badge";
import { ArrowDownIcon, ArrowUpIcon, DollarLineIcon, LockIcon, ShootingStarIcon } from "@/icons";
import Image from "next/image";


type Transaction = {
  initialWorth?: number;
  currentWorth?: number;
  type?: string;
  amounts?: Record<string, number>;
  txUrl?: string;
};
type Pool = {
  name?: string;
  transactions: Transaction[];
};
type Props = {
  lpResults?: { sui?: Pool[] };
};

export const EcommerceMetrics = ({ lpResults, excludedTxs }: Props & { excludedTxs: Record<string, boolean> }) => {
  // Calculate totals
  const pools = lpResults?.sui ?? [];
  // Exclude transactions
  const allTxs = pools.flatMap((pool) =>
    pool.transactions.filter((tx) => tx.txUrl && !excludedTxs[tx.txUrl])
  );
  const totalInitial = allTxs.reduce(
    (sum, tx) => sum + (tx.initialWorth ?? 0),
    0
  );
  const totalCurrent = allTxs.reduce(
    (sum, tx) => sum + (tx.currentWorth ?? 0),
    0
  );
  const il = totalCurrent - totalInitial;

  // Calculate percentage change
  const ilPercent =
    totalInitial !== 0 ? ((il / totalInitial) * 100).toFixed(2) : "0.00";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);

 
  // Calculate total deposited for each token
  const totalByToken: Record<string, number> = { LBTC: 0, SUI: 0, USDT: 0, USDC: 0 };
  for (const tx of allTxs) {
    if (tx.amounts) {
      for (const [symbol, amount] of Object.entries(tx.amounts)) {
        if (totalByToken[symbol] !== undefined) {
          totalByToken[symbol] += amount;
        }
      }
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-12 h-full flex flex-col justify-center">
      {/* Responsive metrics: stack on mobile, row on desktop */}
      <div className="flex flex-col gap-y-6 md:flex-row md:gap-x-12 mt-2">
        <div className="flex-1 flex flex-col items-center md:items-start">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800 mb-3">
            <LockIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Total Initial Value
          </span>
          <h4 className="mt-1 font-bold text-gray-800 text-title-sm dark:text-white/90 text-center md:text-left">
            {formatCurrency(totalInitial)}
          </h4>
        </div>
        <div className="flex-1 flex flex-col items-center md:items-start">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800 mb-3">
            <ShootingStarIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Total Current Value
          </span>
          <h4 className="mt-1 font-bold text-gray-800 text-title-sm dark:text-white/90 text-center md:text-left">
            {formatCurrency(totalCurrent)}
          </h4>
        </div>
        <div className="flex-1 flex flex-col items-center md:items-start">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl dark:bg-gray-800 mb-3">
            <DollarLineIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Impermanent {il < 0 ? "Loss" : "Profit"}
          </span>
          <div className="flex items-center gap-2">
            <h4
              className={`mt-1 font-bold text-title-sm ${
                il < 0 ? "text-red-500" : "text-green-600"
              } text-center md:text-left`}
            >
              {formatCurrency(il)}
            </h4>
            <Badge color={il < 0 ? "error" : "success"}>
              {il < 0 ? (
                <ArrowDownIcon className="text-error-500" />
              ) : (
                <ArrowUpIcon className="text-green-600" />
              )}
              {Math.abs(Number(ilPercent))}%
            </Badge>
          </div>
        </div>
      </div>

      {/* How many LP that they add below metrics */}
      <div className="mt-8 space-y-10">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Total Deposit Pool
          </h3>
          <p className="mt-1 font-normal text-gray-500 text-theme-sm dark:text-gray-400">
            How much you have deposited in across all pools
          </p>
        </div>

        {/* Make table horizontally scrollable on mobile */}
        <div className="space-y-2 overflow-x-auto">
          <div className="min-w-[340px] grid grid-cols-4 gap-x-6 font-semibold text-gray-500 dark:text-gray-400 pb-1">
            <span className="flex items-center gap-1">
              <Image src="/images/icons/btc.svg" alt="LBTC" width={20} height={20} className="w-5 h-5" />LBTC
            </span>
            <span className="flex items-center gap-1">
              <Image src="/images/icons/sui.svg" alt="SUI" width={20} height={20} className="w-5 h-5" />SUI
            </span>
            <span className="flex items-center gap-1">
              <Image src="/images/icons/usdt.svg" alt="USDT" width={20} height={20} className="w-5 h-5" />USDT
            </span>
            <span className="flex items-center gap-1">
              <Image src="/images/icons/usdc.svg" alt="USDC" width={20} height={20} className="w-5 h-5" />USDC
            </span>
          </div>
          <div className="min-w-[340px] grid grid-cols-4 gap-x-6 font-bold text-gray-800 dark:text-white pb-2">
            <span className="flex items-center gap-1 text-orange-600">
              {totalByToken.LBTC?.toFixed(4) ?? "0.0000"} <span className="font-normal text-xs ml-1">LBTC</span>
            </span>
            <span className="flex items-center gap-1 text-blue-600">
              {totalByToken.SUI?.toFixed(4) ?? "0.0000"} <span className="font-normal text-xs ml-1">SUI</span>
            </span>
            <span className="flex items-center gap-1 text-green-600">
              {totalByToken.USDT?.toFixed(4) ?? "0.0000"} <span className="font-normal text-xs ml-1">USDT</span>
            </span>
            <span className="flex items-center gap-1 text-indigo-600">
              {totalByToken.USDC?.toFixed(4) ?? "0.0000"} <span className="font-normal text-xs ml-1">USDC</span>
            </span>
          </div>
        </div>
      </div>
      {/* <ReactApexChart options={options} series={series} type="bar" height={180} /> */}
    </div>
  );
};

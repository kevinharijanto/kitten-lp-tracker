"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import React, { useState } from "react";
import Image from "next/image";
import { startOfMonth, startOfWeek, startOfDay, isAfter, parseISO } from "date-fns";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// Add at the top of MonthlyTarget.tsx if not already imported
interface Transaction {
  type: "add" | "remove";
  txUrl: string;
  initialWorth: number;
  currentWorth: number;
  amounts: Record<string, number>;
  timestamp: string;
}

interface LPResult {
  name: string;
  transactions: Transaction[];
}

interface ClaimFeeTransaction {
  poolName: string;
  txUrl: string;
  amounts: Record<string, string>;
  timestamp: string;
  currentWorthUSD: number;
  initializeWorthUSD: number;
}

// Helper to get token totals for a given claimFee array
function getTokenTotals(fees: ClaimFeeTransaction[]) {
  const totals: Record<string, number> = {};
  for (const tx of fees) {
    if (tx.amounts) {
      for (const [symbol, amount] of Object.entries(tx.amounts)) {
        // ClaimFeeTransaction.amounts is Record<string, string>
        const numAmount = typeof amount === "number" ? amount : Number(amount);
        if (!isNaN(numAmount)) {
          totals[symbol] = (totals[symbol] || 0) + numAmount;
        }
      }
    }
  }
  return totals;
}

// Tooltip component for claimed amounts
function ClaimFeeTooltip({ tokenTotals }: { tokenTotals: Record<string, number> }) {
  return (
    <div className="absolute z-10 top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[200px]">
      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-200">
        Claimed Amounts
      </div>
      {Object.entries(tokenTotals).length === 0 && (
        <div className="text-xs text-gray-400">No claim fees</div>
      )}
      {Object.entries(tokenTotals).map(([symbol, amount]) => {
        let logo = "";
        let color = "";
        if (symbol === "SUI") {
          logo = "/images/icons/sui.svg";
          color = "text-blue-500";
        } else if (symbol === "USDC") {
          logo = "/images/icons/usdc.svg";
          color = "text-indigo-500";
        } else if (symbol === "USDT") {
          logo = "/images/icons/usdt.svg";
          color = "text-green-500";
        } else if (symbol === "LBTC" || symbol === "BTC") {
          logo = "/images/icons/btc.svg";
          color = "text-orange-500";
        } else {
          logo = "/images/icons/token.svg";
          color = "text-gray-500";
        }
        return (
          <div
            key={symbol}
            className="flex items-center justify-between text-xs mb-1"
          >
            <span className="flex items-center gap-2">
              <Image src={logo} alt={symbol} width={16} height={16} className="w-4 h-4" />
              <span className={`font-semibold ${color}`}>{symbol}</span>
            </span>
            <span className={`font-mono ${color}`}>
              {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MonthlyTarget({
  lpResults = [],
  claimFees = [],
}: {
  lpResults?: LPResult[];
  claimFees?: ClaimFeeTransaction[];
}) {
  // Calculate total claim fee (USD)
  const totalClaimFee = claimFees.reduce(
    (sum, tx) => sum + (typeof tx.currentWorthUSD === "number" ? tx.currentWorthUSD : 0),
    0
  );

  // Calculate total current value (USD)
  const totalCurrentValue = lpResults.reduce(
    (sum: number, pool: LPResult) =>
      sum +
      (Array.isArray(pool.transactions)
        ? pool.transactions.reduce(
            (txSum: number, tx: Transaction) =>
              txSum + (typeof tx.currentWorth === "number" ? tx.currentWorth : 0),
            0
          )
        : 0),
    0
  );

  // Calculate claim fee percent for chart
  const claimFeePercent =
    totalCurrentValue > 0 ? (totalClaimFee / totalCurrentValue) * 100 : 0;
  const series = [Number(claimFeePercent.toFixed(2))];

  // Filter claimFees by date for each period
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday as start
  const dayStart = startOfDay(now);

  const filterFees = (fromDate: Date) =>
    claimFees.filter(
      (tx) =>
        isAfter(parseISO(tx.timestamp), fromDate) &&
        typeof tx.currentWorthUSD === "number"
    );

  const monthlyFees = filterFees(monthStart);
  const weeklyFees = filterFees(weekStart);
  const dailyFees = filterFees(dayStart);

  // Calculate claim fee sums for each period
  const monthlyClaimFee = monthlyFees.reduce(
    (sum, tx) => sum + (typeof tx.currentWorthUSD === "number" ? tx.currentWorthUSD : 0),
    0
  );
  const weeklyClaimFee = weeklyFees.reduce(
    (sum, tx) => sum + (typeof tx.currentWorthUSD === "number" ? tx.currentWorthUSD : 0),
    0
  );
  const dailyClaimFee = dailyFees.reduce(
    (sum, tx) => sum + (typeof tx.currentWorthUSD === "number" ? tx.currentWorthUSD : 0),
    0
  );

  // Tooltip state for each section
  const [showMonthlyTooltip, setShowMonthlyTooltip] = useState(false);
  const [showWeeklyTooltip, setShowWeeklyTooltip] = useState(false);
  const [showDailyTooltip, setShowDailyTooltip] = useState(false);
  const [showTotalTooltip, setShowTotalTooltip] = useState(false);

  const options: ApexOptions = {
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radialBar",
      height: 220,
      sparkline: { enabled: true },
    },
    plotOptions: {
      radialBar: {
        startAngle: -85,
        endAngle: 85,
        hollow: { size: "60%" },
        track: { background: "#E4E7EC", strokeWidth: "100%", margin: 5 },
        dataLabels: {
          name: { show: false },
          value: {
            fontSize: "12px",
            fontWeight: "600",
            offsetY: -40,
            color: "#1D2939",
            formatter: (val) => val + "%",
          },
        },
      },
    },
    fill: { type: "solid", colors: ["#465FFF"] },
    stroke: { lineCap: "round" },
    labels: ["Progress"],
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Total Claim Fee
            </h3>
            <p className="mt-1 font-normal text-gray-500 text-theme-sm dark:text-gray-400">
              The total of all claim fees collected so far.
            </p>
          </div>
        </div>
        <div className="relative ">
          <div
            className="mt-6 flex flex-col items-center relative"
            onMouseEnter={() => setShowTotalTooltip(true)}
            onMouseLeave={() => setShowTotalTooltip(false)}
          >
            <span className="text-4xl font-bold text-brand-500 cursor-pointer">
              ${totalClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {/* Tooltip for total claim fee */}
            {showTotalTooltip && (
              <ClaimFeeTooltip tokenTotals={getTokenTotals(claimFees)} />
            )}
          </div>
          <div className="max-h-[330px]">
            <ReactApexChart
              options={options}
              series={series}
              type="radialBar"
              height={270}
            />
          </div>
          <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-[95%] rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-500">
            -
          </span>
        </div>
        <p className="mx-auto mt-10 w-full max-w-[380px] text-center text-sm text-gray-500 sm:text-base">
          You earn ${totalClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })} on total claim fee, that          You earn ${totalClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })} on total claim fee, that {claimFeePercent.toFixed(2)}% of your investment. Keep up your good work!s {claimFeePercent.toFixed(2)}% of your investment. Keep up your good work!
        </p>
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => setShowMonthlyTooltip(true)}
          onMouseLeave={() => setShowMonthlyTooltip(false)}
        >
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Monthly
          </p>
          <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg cursor-pointer">
            ${monthlyClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {showMonthlyTooltip && (
            <ClaimFeeTooltip tokenTotals={getTokenTotals(monthlyFees)} />
          )}
        </div>
        <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => setShowWeeklyTooltip(true)}
          onMouseLeave={() => setShowWeeklyTooltip(false)}
        >
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Weekly
          </p>
          <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg cursor-pointer">
            ${weeklyClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {showWeeklyTooltip && (
            <ClaimFeeTooltip tokenTotals={getTokenTotals(weeklyFees)} />
          )}
        </div>
        <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => setShowDailyTooltip(true)}
          onMouseLeave={() => setShowDailyTooltip(false)}
        >
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Daily
          </p>
          <p className="flex items-center justify-center gap-1 text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg cursor-pointer">
            ${dailyClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {showDailyTooltip && (
            <ClaimFeeTooltip tokenTotals={getTokenTotals(dailyFees)} />
          )}
        </div>
      </div>
    </div>
  );
}

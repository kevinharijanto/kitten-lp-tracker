"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import React, { useState } from "react";
import Image from "next/image";
import { startOfMonth, startOfWeek, startOfDay, isAfter, parseISO, format } from "date-fns";

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
  initialWorthUSD: number;
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

// Detail popup component for claim fees table
function ClaimFeeDetailPopup({
  claimFees,
  onClose,
}: {
  claimFees: ClaimFeeTransaction[];
  onClose: () => void;
}) {
  const getTokenIcon = (symbol: string) => {
    if (symbol === "SUI") return "/images/icons/sui.svg";
    if (symbol === "USDC") return "/images/icons/usdc.svg";
    if (symbol === "USDT") return "/images/icons/usdt.svg";
    if (symbol === "LBTC" || symbol === "BTC") return "/images/icons/btc.svg";
    if (symbol === "XSUI" || symbol === "X_SUI") return "/images/icons/sui.svg";
    return "/images/icons/token.svg";
  };

  const getTokenColor = (symbol: string) => {
    if (symbol === "SUI") return "text-blue-500";
    if (symbol === "USDC") return "text-indigo-500";
    if (symbol === "USDT") return "text-green-500";
    if (symbol === "LBTC" || symbol === "BTC") return "text-orange-500";
    if (symbol === "XSUI" || symbol === "X_SUI") return "text-blue-400";
    return "text-gray-500";
  };

  // Dynamic pool name mapping based on the tokens found in claim fees
  const createPoolMapping = (claimFees: ClaimFeeTransaction[]) => {
    const poolMapping: Record<string, string> = {};
    
    claimFees.forEach((fee) => {
      if (!fee.amounts || Object.keys(fee.amounts).length === 0) return;
      
      // Get tokens from the amounts
      const tokens = Object.keys(fee.amounts)
        .filter(token => {
          const amount = Number(fee.amounts[token]);
          return !isNaN(amount) && amount > 0;
        })
        .sort(); // Sort alphabetically for consistency
      
      if (tokens.length >= 2) {
        // Create pool name from tokens
        let poolName = '';
        
        // Special ordering rules for known pairs
        if (tokens.includes('USDC') && tokens.includes('SUI')) {
          poolName = 'USDC-SUI';
        } else if (tokens.includes('LBTC') && tokens.includes('SUI')) {
          poolName = 'LBTC-SUI';
        } else if (tokens.includes('USDC') && tokens.includes('USDT')) {
          poolName = 'USDC-USDT';
        } else if ((tokens.includes('SUI') && tokens.includes('XSUI')) || 
                   (tokens.includes('SUI') && tokens.includes('X_SUI'))) {
          poolName = 'SUI-X_SUI';
        } else {
          // For unknown pairs, sort alphabetically
          poolName = tokens.slice(0, 2).join('-');
        }
        
        poolMapping[fee.poolName] = poolName;
      }
    });
    
    return poolMapping;
  };

  const formatPoolName = (poolId: string) => {
    // Create dynamic mapping from current claim fees
    const poolMapping = createPoolMapping(claimFees);
    
    // Check if we have a mapping for this pool ID
    if (poolMapping[poolId]) {
      return poolMapping[poolId];
    }
    
    // Fallback: try to extract from the specific fee entry
    const matchingFee = claimFees.find(fee => fee.poolName === poolId);
    if (matchingFee && matchingFee.amounts) {
      const tokens = Object.keys(matchingFee.amounts)
        .filter(token => {
          const amount = Number(matchingFee.amounts[token]);
          return !isNaN(amount) && amount > 0;
        })
        .sort();
      
      if (tokens.length >= 2) {
        // Apply same ordering logic
        if (tokens.includes('USDC') && tokens.includes('SUI')) {
          return 'USDC-SUI';
        } else if (tokens.includes('LBTC') && tokens.includes('SUI')) {
          return 'LBTC-SUI';
        } else if (tokens.includes('USDC') && tokens.includes('USDT')) {
          return 'USDC-USDT';
        } else if ((tokens.includes('SUI') && tokens.includes('XSUI')) || 
                   (tokens.includes('SUI') && tokens.includes('X_SUI'))) {
          return 'SUI-X_SUI';
        } else {
          return tokens.slice(0, 2).join('-');
        }
      }
    }
    
    // Ultimate fallback: shortened pool ID
    return poolId.length > 10 ? poolId.slice(0, 8) + "..." : poolId;
  };

  // Group claim fees by pool name for better organization
  const groupedFees = claimFees.reduce((groups, fee) => {
    const poolName = formatPoolName(fee.poolName);
    if (!groups[poolName]) {
      groups[poolName] = [];
    }
    groups[poolName].push(fee);
    return groups;
  }, {} as Record<string, ClaimFeeTransaction[]>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Claim Fee Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {Object.keys(groupedFees).length} pools • {claimFees.length} transactions
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-auto max-h-[calc(90vh-80px)]">
          {claimFees.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No claim fee transactions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Pool
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Claimed Tokens
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      USD Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Transaction
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {claimFees
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((fee, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatPoolName(fee.poolName)}
                            </span>
                            <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                              {fee.poolName.slice(0, 12)}...
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(fee.amounts).map(([symbol, amount]) => {
                              const numAmount = Number(amount);
                              if (numAmount === 0) return null;
                              
                              return (
                                <div key={symbol} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                  <Image 
                                    src={getTokenIcon(symbol)} 
                                    alt={symbol} 
                                    width={16} 
                                    height={16} 
                                    className="w-4 h-4" 
                                  />
                                  <span className={`text-xs font-medium ${getTokenColor(symbol)}`}>
                                    {numAmount.toLocaleString(undefined, { 
                                      maximumFractionDigits: 6,
                                      minimumFractionDigits: 0 
                                    })} {symbol}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            ${fee.currentWorthUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {format(parseISO(fee.timestamp), "MMM dd, yyyy")}
                          </span>
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {format(parseISO(fee.timestamp), "HH:mm:ss")}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={fee.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm transition-colors"
                          >
                            View
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
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
  // State for detail popup
  const [showDetailPopup, setShowDetailPopup] = useState(false);

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
    <>
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
            {/* Detail Button */}
            <button
              onClick={() => setShowDetailPopup(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Details
            </button>
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
              You earn ${totalClaimFee.toLocaleString(undefined, { maximumFractionDigits: 2 })} on total claim fee, that {claimFeePercent.toFixed(2)}% of your investment. Keep up your good work!
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

      {/* Detail Popup */}
      {showDetailPopup && (
        <ClaimFeeDetailPopup
          claimFees={claimFees}
          onClose={() => setShowDetailPopup(false)}
        />
      )}
    </>
  );
}

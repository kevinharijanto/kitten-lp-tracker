import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import React, { useState } from "react";

type Transaction = {
  type: "add" | "remove";
  txUrl: string;
  initialWorth?: number;
  currentWorth?: number;
  amounts: { [coinType: string]: string };
  timestamp: string;
};

type Pool = {
  name: string;
  transactions: Transaction[];
};

type LPRange = {
  poolName: string;
  lower: number;
  upper: number;
};

export type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  isHeader?: boolean;
};

type RecentOrdersProps = {
  lpResults?: { sui?: Pool[] };
  lpRanges?: LPRange[];
  isLoading?: boolean;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);

export default function RecentOrders({
  lpResults,
  lpRanges = [],
  isLoading,
}: RecentOrdersProps) {
  const [hideZero, setHideZero] = useState(false);
  const [expandedPools, setExpandedPools] = useState<Record<string, boolean>>({});
  const pools = lpResults?.sui ?? [];

  // Helper function to get LP range for a pool
  const getLPRange = (poolName: string) => {
    return lpRanges.find(range => range.poolName === poolName);
  };

  // Helper function to format LP range
  const formatLPRange = (range: LPRange | undefined) => {
    if (!range) return "N/A";
    return `${range.lower.toFixed(3)} - ${range.upper.toFixed(3)}`;
  };

  const togglePoolExpansion = (poolName: string) => {
    setExpandedPools(prev => ({
      ...prev,
      [poolName]: !prev[poolName]
    }));
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-800 dark:text-white/90">Loading LP data...</div>;
  }

  if (!pools.length) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">No LP data found.</div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            SUI LP Positions
          </h3>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={() => setHideZero((v) => !v)}
            className="accent-brand-500"
          />
          Hide zero balance
        </label>
      </div>
      {/* Desktop Table View */}
      <div className="hidden md:block max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
            <TableRow>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Pool
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Type
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Initial Worth
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Current Worth
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                IL
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Range LP
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Tx
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Timestamp
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {pools.map((pool) => {
              // Calculate totals from all transactions
              const totalInitial = pool.transactions.reduce(
                (sum, tx) => sum + (tx.initialWorth ?? 0),
                0
              );
              const totalCurrent = pool.transactions.reduce(
                (sum, tx) => sum + (tx.currentWorth ?? 0),
                0
              );
              const totalIL = totalCurrent - totalInitial;
              const isExpanded = expandedPools[pool.name];

              // If hideZero is enabled, hide pools where total current worth is close to zero
              if (hideZero && Math.abs(totalCurrent) < 1) {
                return null;
              }

              // Filter transactions for display if hideZero is enabled
              const displayTxs = hideZero
                ? pool.transactions.filter(
                    (tx) =>
                      (tx.initialWorth ?? 0) <= -1 ||
                      (tx.initialWorth ?? 0) >= 1 ||
                      (tx.currentWorth ?? 0) <= -1 ||
                      (tx.currentWorth ?? 0) >= 1
                  )
                : pool.transactions;

              if (pool.transactions.length === 0) return null;

              return (
                <React.Fragment key={pool.name}>
                  {/* Pool header row with expand/collapse functionality */}
                  <TableRow className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell className="py-3 font-bold text-gray-800 dark:text-white/90">
                      <div 
                        className="flex items-center gap-2 w-full"
                        onClick={() => togglePoolExpansion(pool.name)}
                      >
                        <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        {pool.name}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-gray-700 dark:text-gray-300">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">{""}</div>
                    </TableCell>
                    <TableCell className="py-3 font-bold text-lg text-gray-800 dark:text-white/90">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">
                        {formatCurrency(totalInitial)}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 font-bold text-lg text-gray-800 dark:text-white/90">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">
                        {formatCurrency(totalCurrent)}
                      </div>
                    </TableCell>
                    <TableCell
                      className={`py-3 font-bold text-lg ${
                        totalIL < 0 ? "text-red-500" : "text-green-500"
                      }`}
                    >
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">
                        {formatCurrency(totalIL)}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 font-medium text-sm text-gray-800 dark:text-white/90">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">
                        {formatLPRange(getLPRange(pool.name))}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-gray-700 dark:text-gray-300">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">{""}</div>
                    </TableCell>
                    <TableCell className="py-3 text-gray-700 dark:text-gray-300">
                      <div onClick={() => togglePoolExpansion(pool.name)} className="w-full h-full">{""}</div>
                    </TableCell>
                  </TableRow>
                  {/* Pool transactions - only show when expanded */}
                  {isExpanded && displayTxs.map((tx, idx) => {
                    const il = (tx.currentWorth ?? 0) - (tx.initialWorth ?? 0);
                    return (
                      <TableRow
                        key={pool.name + idx}
                      >
                        <TableCell className="py-3 text-gray-700 dark:text-gray-300">{""}</TableCell>
                        <TableCell
                          className={`py-3 font-semibold ${
                            tx.type === "add" ? "text-blue-500" : "text-orange-500"
                          }`}
                        >
                          {tx.type === "add" ? "Add" : "Remove"}
                        </TableCell>
                        <TableCell className="py-3 text-gray-800 dark:text-white/90">
                          {formatCurrency(tx.initialWorth ?? 0)}
                        </TableCell>
                        <TableCell className="py-3 text-gray-800 dark:text-white/90">
                          {formatCurrency(tx.currentWorth ?? 0)}
                        </TableCell>
                        <TableCell
                          className={`py-3 ${
                            il < 0 ? "text-red-500" : "text-green-500"
                          }`}
                        >
                          {formatCurrency(il)}
                        </TableCell>
                        <TableCell className="py-3 text-gray-700 dark:text-gray-300">{""}</TableCell>
                        <TableCell className="py-3">
                          <a
                            href={tx.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
                          >
                            View
                          </a>
                        </TableCell>
                        <TableCell className="py-3 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(tx.timestamp).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {pools.map((pool) => {
          // Calculate totals from all transactions
          const totalInitial = pool.transactions.reduce(
            (sum, tx) => sum + (tx.initialWorth ?? 0),
            0
          );
          const totalCurrent = pool.transactions.reduce(
            (sum, tx) => sum + (tx.currentWorth ?? 0),
            0
          );
          const totalIL = totalCurrent - totalInitial;
          const isExpanded = expandedPools[pool.name];

          // If hideZero is enabled, hide pools where total current worth is close to zero
          if (hideZero && Math.abs(totalCurrent) < 1) {
            return null;
          }

          // Filter transactions for display if hideZero is enabled
          const displayTxs = hideZero
            ? pool.transactions.filter(
                (tx) =>
                  (tx.initialWorth ?? 0) <= -1 ||
                  (tx.initialWorth ?? 0) >= 1 ||
                  (tx.currentWorth ?? 0) <= -1 ||
                  (tx.currentWorth ?? 0) >= 1
              )
            : pool.transactions;

          if (pool.transactions.length === 0) return null;

          return (
            <div key={pool.name} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              {/* Pool Header Card */}
              <div 
                className="cursor-pointer"
                onClick={() => togglePoolExpansion(pool.name)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <h4 className="font-bold text-gray-800 dark:text-white/90">{pool.name}</h4>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Initial Worth</span>
                    <span className="font-semibold text-gray-800 dark:text-white/90">{formatCurrency(totalInitial)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Current Worth</span>
                    <span className="font-semibold text-gray-800 dark:text-white/90">{formatCurrency(totalCurrent)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400 block">Impermanent Loss</span>
                    <span className={`font-semibold ${totalIL < 0 ? "text-red-500" : "text-green-500"}`}>
                      {formatCurrency(totalIL)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400 block">Range LP</span>
                    <span className="font-semibold text-gray-800 dark:text-white/90">
                      {formatLPRange(getLPRange(pool.name))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Transactions */}
              {isExpanded && displayTxs.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  {displayTxs.map((tx, idx) => {
                    const il = (tx.currentWorth ?? 0) - (tx.initialWorth ?? 0);
                    return (
                      <div 
                        key={pool.name + idx} 
                        className="bg-white dark:bg-gray-900/50 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-semibold ${
                            tx.type === "add" ? "text-blue-500" : "text-orange-500"
                          }`}>
                            {tx.type === "add" ? "Add" : "Remove"}
                          </span>
                          <a
                            href={tx.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs underline"
                          >
                            View Tx
                          </a>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block text-xs">Initial</span>
                            <span className="text-gray-800 dark:text-white/90">{formatCurrency(tx.initialWorth ?? 0)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block text-xs">Current</span>
                            <span className="text-gray-800 dark:text-white/90">{formatCurrency(tx.currentWorth ?? 0)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block text-xs">IL</span>
                            <span className={`${il < 0 ? "text-red-500" : "text-green-500"}`}>
                              {formatCurrency(il)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 block text-xs">Date</span>
                            <span className="text-gray-600 dark:text-gray-400 text-xs">
                              {new Date(tx.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


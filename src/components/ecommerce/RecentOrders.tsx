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

export type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  isHeader?: boolean;
};

type RecentOrdersProps = {
  lpResults?: { sui?: Pool[] };
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
  isLoading,
  excludedTxs,
  setExcludedTxs,
}: RecentOrdersProps & {
  excludedTxs: Record<string, boolean>;
  setExcludedTxs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [hideZero, setHideZero] = useState(false);
  const pools = lpResults?.sui ?? [];

  if (isLoading) {
    return <div className="text-center py-8">Loading LP data...</div>;
  }

  if (!pools.length) {
    return (
      <div className="text-center py-8 text-gray-400">No LP data found.</div>
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={() => setHideZero((v) => !v)}
            className="accent-brand-500"
          />
          Hide zero balance
        </label>
      </div>
      <div className="max-w-full overflow-x-auto">
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
                Tx
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Timestamp
              </TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                Exclude
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {pools.map((pool) => {
              // Filter transactions if hideZero is enabled
              const filteredTxs = (hideZero
                ? pool.transactions.filter(
                    (tx) =>
                      ((tx.initialWorth ?? 0) <= -1 ||
                        (tx.initialWorth ?? 0) >= 1 ||
                        (tx.currentWorth ?? 0) <= -1 ||
                        (tx.currentWorth ?? 0) >= 1) &&
                      !excludedTxs[tx.txUrl]
                  )
                : pool.transactions.filter((tx) => !excludedTxs[tx.txUrl])) as Transaction[];

              const totalInitial = filteredTxs.reduce(
                (sum, tx) => sum + (tx.initialWorth ?? 0),
                0
              );
              const totalCurrent = filteredTxs.reduce(
                (sum, tx) => sum + (tx.currentWorth ?? 0),
                0
              );
              const totalIL = totalCurrent - totalInitial;

              if (filteredTxs.length === 0) return null;

              return (
                <React.Fragment key={pool.name}>
                  {/* Pool header row */}
                  <TableRow>
                    <TableCell className="py-3 font-bold">{pool.name}</TableCell>
                  </TableRow>
                  {/* Pool transactions */}
                  {filteredTxs.map((tx, idx) => {
                    const il = (tx.currentWorth ?? 0) - (tx.initialWorth ?? 0);
                    return (
                      <TableRow
                        key={pool.name + idx}
                        className={excludedTxs[tx.txUrl] ? "opacity-40" : ""} // transparent if excluded
                      >
                        <TableCell className="py-3">{""}</TableCell>
                        <TableCell
                          className={`py-3 font-semibold ${
                            tx.type === "add" ? "text-blue-500" : "text-orange-500"
                          }`}
                        >
                          {tx.type === "add" ? "Add" : "Remove"}
                        </TableCell>
                        <TableCell className="py-3">
                          {formatCurrency(tx.initialWorth ?? 0)}
                        </TableCell>
                        <TableCell className="py-3">
                          {formatCurrency(tx.currentWorth ?? 0)}
                        </TableCell>
                        <TableCell
                          className={`py-3 ${
                            il < 0 ? "text-red-500" : "text-green-500"
                          }`}
                        >
                          {formatCurrency(il)}
                        </TableCell>
                        <TableCell className="py-3">
                          <a
                            href={tx.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline"
                          >
                            View
                          </a>
                        </TableCell>
                        <TableCell className="py-3 text-xs text-gray-500">
                          {new Date(tx.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3">
                          <input
                            type="checkbox"
                            checked={!!excludedTxs[tx.txUrl]}
                            onChange={() =>
                              setExcludedTxs((prev) => ({
                                ...prev,
                                [tx.txUrl]: !prev[tx.txUrl],
                              }))
                            }
                            className="accent-brand-500"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Pool totals row */}
                  <TableRow>
                    <TableCell className="py-3 font-bold">Total</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="py-3">{""}</TableCell>
                    <TableCell className="py-3">{""}</TableCell>
                    <TableCell className="py-3 font-bold text-lg">
                      {formatCurrency(totalInitial)}
                    </TableCell>
                    <TableCell className="py-3 font-bold text-lg">
                      {formatCurrency(totalCurrent)}
                    </TableCell>
                    <TableCell
                      className={`py-3 font-bold text-lg ${
                        totalIL < 0 ? "text-red-500" : "text-green-500"
                      }`}
                    >
                      {formatCurrency(totalIL)}
                    </TableCell>
                    <TableCell className="py-3">{""}</TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import AppHeader from "@/layout/AppHeader";
import AppFooter from "@/layout/AppFooter";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dynamic class for main content margin based on sidebar sta
  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out `}
      >
        {/* Header */}
        <AppHeader />
        {/* Page Content */}
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          {children}
        </div>
        <AppFooter />
      </div>
    </div>
  );
}

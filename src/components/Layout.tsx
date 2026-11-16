import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Receipt,
  Wallet,
  TrendingUp,
  FileSpreadsheet,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppTab, BusinessSettings } from '../types';
import { useBrandLogos } from '../hooks/useBrandLogos';

interface LayoutProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  user: User;
  settings: BusinessSettings;
  onSignOut: () => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
}

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoices', label: 'Normal Invoice', icon: FileText },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'calculator', label: 'Cost Calculator', icon: Calculator },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'pnl', label: 'Monthly P&L', icon: TrendingUp },
  { id: 'reports', label: 'Month-End Reports', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Layout({
  activeTab,
  onSelectTab,
  user,
  settings,
  onSignOut,
  primaryAction,
  children,
}: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { whiteLogoSrc } = useBrandLogos(settings);

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleNavClick = (tab: AppTab) => {
    onSelectTab(tab);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex">
      {/* Desktop Navy Sidebar */}
      <aside
        className={`no-print hidden lg:flex flex-col bg-[#0B1F3A] text-white border-r border-[#071629] shrink-0 transition-[width] duration-150 ${
          collapsed ? 'w-[72px]' : 'w-[252px]'
        }`}
      >
        {/* Brand Header */}
        <div
          className={`h-16 flex items-center border-b border-[#163A63]/70 bg-[#071629] ${
            collapsed ? 'px-2 justify-center relative' : 'px-3.5 justify-between gap-2'
          }`}
        >
          <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
            {whiteLogoSrc ? (
              <img
                src={whiteLogoSrc}
                alt={settings.businessName || 'Netzone logo'}
                className={
                  collapsed
                    ? 'h-8 w-11 object-contain shrink-0'
                    : 'h-10 w-auto max-w-[96px] object-contain shrink-0'
                }
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#163A63] border border-white/15 flex items-center justify-center font-semibold text-white shrink-0">
                N
              </div>
            )}
            {!collapsed && settings.businessName?.trim() && (
              <span className="font-semibold text-xs text-white/95 leading-tight line-clamp-2 min-w-0">
                {settings.businessName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`p-1.5 rounded-md text-[#B8CAE0] hover:text-white hover:bg-[#163A63] transition-colors cursor-pointer shrink-0 ${
              collapsed ? 'hidden' : ''
            }`}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-[#163A63] border border-white/20 text-white flex items-center justify-center shadow-md hover:bg-[#1d4a7d] transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#163A63] text-white shadow-xs'
                    : 'text-[#CBD8E8] hover:bg-[#163A63]/60 hover:text-white'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-[#163A63]/70 bg-[#071629]">
          {!collapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user.displayName || settings.businessName}
                </p>
                <p className="text-[11px] text-[#9FB4CE] truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 rounded-md text-[#B8CAE0] hover:text-white hover:bg-[#163A63] transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="w-full min-h-[40px] flex justify-center items-center p-2 rounded-md text-[#B8CAE0] hover:text-white hover:bg-[#163A63] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#071629]/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B1F3A] text-white flex flex-col h-full z-10">
            <div className="h-16 px-4 flex items-center justify-between gap-2 border-b border-[#163A63]/70 bg-[#071629]">
              <div className="flex items-center gap-2.5 min-w-0">
                {whiteLogoSrc ? (
                  <img
                    src={whiteLogoSrc}
                    alt={settings.businessName || 'Netzone logo'}
                    className="h-9 w-auto max-w-[96px] object-contain shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-[#163A63] border border-white/15 flex items-center justify-center font-semibold text-white text-sm shrink-0">
                    N
                  </div>
                )}
                {settings.businessName?.trim() && (
                  <span className="font-semibold text-xs text-white/95 leading-tight line-clamp-2 min-w-0">
                    {settings.businessName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-md text-[#B8CAE0] hover:text-white hover:bg-[#163A63]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#163A63] text-white'
                        : 'text-[#CBD8E8] hover:bg-[#163A63]/60 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-[#163A63]/70 bg-[#071629] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user.displayName || settings.businessName}
                </p>
                <p className="text-[11px] text-[#9FB4CE] truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[40px] px-3 py-2 rounded-md bg-[#163A63] text-xs font-medium text-white hover:bg-[#1d4a7d]"
              >
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: White bar, Navy accents & primary CTA */}
        <header className="no-print sticky top-0 z-30 h-14 lg:h-16 bg-white border-b border-[#DCE4EF] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 -ml-2 rounded-md text-[#0B1F3A] hover:bg-[#E8EFF8] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-[#64748B] truncate max-w-[200px]">
                {settings.businessName}
              </span>
              <span className="hidden sm:inline text-[#DCE4EF]">/</span>
              <h1 className="font-semibold text-[#0B1F3A] truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="min-h-[40px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {primaryAction.label}
            </button>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signOutUser, testFirestoreConnection } from './firebase';
import {
  defaultSettingsForUser,
  ensureBusinessSettings,
  subscribeToCollection,
  subscribeToSettings,
} from './services/firestoreService';
import type {
  AppTab,
  BusinessSettings,
  Customer,
  Expense,
  Invoice,
  JobCosting,
  Payment,
} from './types';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Customers } from './components/Customers';
import { Invoices } from './components/Invoices';
import { MaterialCalculator } from './components/MaterialCalculator';
import { Expenses } from './components/Expenses';
import { Payments } from './components/Payments';
import { MonthlyPnL } from './components/MonthlyPnL';
import { MonthEndReports } from './components/MonthEndReports';
import { SettingsView } from './components/SettingsView';

const AUTHORIZED_GOOGLE_EMAILS = new Set(['arsathgnaniyar911@gmail.com']);

function isAuthorizedGoogleUser(user: User | null): user is User {
  if (!user || !user.emailVerified || !user.email) return false;
  return AUTHORIZED_GOOGLE_EMAILS.has(user.email.trim().toLowerCase());
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);


  const [offlineWarning, setOfflineWarning] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [newInvoiceSignal, setNewInvoiceSignal] = useState(0);
  const [addExpenseSignal, setAddExpenseSignal] = useState(0);
  const [recordPaymentSignal, setRecordPaymentSignal] = useState(0);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobCostings, setJobCostings] = useState<JobCosting[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const clearWorkspaceData = useCallback(() => {
    setSettings(null);
    setCustomers([]);
    setInvoices([]);
    setJobCostings([]);
    setExpenses([]);
    setPayments([]);
  }, []);

  const handleSignOut = useCallback(async () => {
    setUser(null);
    clearWorkspaceData();
    await signOutUser();
  }, [clearWorkspaceData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Verify Firestore connectivity on boot
  useEffect(() => {
    testFirestoreConnection().then((res) => {
      if (res.offline) setOfflineWarning(true);
    });
  }, []);

  // Listen to Firebase Google Auth state and restrict access to authorized accounts
  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        if (!u) {
          setUser(null);
          clearWorkspaceData();
          setAuthReady(true);
          return;
        }

        if (!isAuthorizedGoogleUser(u)) {
          setUser(null);
          clearWorkspaceData();
          setAuthError(
            'Access denied. This Google account is not authorized for Netzone.'
          );
          setAuthReady(true);
          try {
            await signOutUser();
          } catch {
            // Ignore sign-out cleanup error
          }
          return;
        }

        setAuthError(null);
        setUser(u);
        setAuthReady(true);
      },
      (err) => {
        setUser(null);
        clearWorkspaceData();
        setAuthError(err.message);
        setAuthReady(true);
      }
    );
    return () => unsub();
  }, [clearWorkspaceData]);

  // Attach Firestore real-time listeners only for an authenticated, authorized Google user
  useEffect(() => {
    if (!authReady || !user || !isAuthorizedGoogleUser(user)) return;
    let active = true;

    const initial = defaultSettingsForUser(user.uid, user.email);
    setSettings(initial);

    ensureBusinessSettings(user.uid, user.email).catch((err) => {
      if (active) {
        notify(err instanceof Error ? err.message : 'Unable to initialize workspace.', 'error');
      }
    });

    const unsubs = [
      subscribeToSettings(user.uid, (s) => active && setSettings(s)),
      subscribeToCollection<Customer>('customers', user.uid, (d) => active && setCustomers(d)),
      subscribeToCollection<Invoice>('invoices', user.uid, (d) => active && setInvoices(d)),
      subscribeToCollection<JobCosting>('jobCostings', user.uid, (d) => active && setJobCostings(d)),
      subscribeToCollection<Expense>('expenses', user.uid, (d) => active && setExpenses(d)),
      subscribeToCollection<Payment>('payments', user.uid, (d) => active && setPayments(d)),
    ];

    return () => {
      active = false;
      unsubs.forEach((u) => u());
    };
  }, [authReady, user]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center">
        <div className="text-sm font-medium text-[#0B1F3A]">
          Loading Netzone...
        </div>
      </div>
    );
  }

  if (!user || !isAuthorizedGoogleUser(user)) {
    return (
      <AuthScreen
        authError={authError}
        onClearAuthError={() => setAuthError(null)}
      />
    );
  }

  const activeSettings = settings || defaultSettingsForUser(user.uid, user.email);

  const openQuickCreateInvoice = () => {
    setNewInvoiceSignal((n) => n + 1);
    setActiveTab('invoices');
  };

  const openQuickAddExpense = () => {
    setAddExpenseSignal((n) => n + 1);
    setActiveTab('expenses');
  };

  const openQuickRecordPayment = () => {
    setRecordPaymentSignal((n) => n + 1);
    setActiveTab('payments');
  };

  const primaryAction =
    activeTab === 'dashboard'
      ? { label: '+ New Invoice', onClick: openQuickCreateInvoice }
      : undefined;

  return (
    <>
      <Layout
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        settings={activeSettings}
        onSignOut={handleSignOut}
        primaryAction={primaryAction}
      >
        {offlineWarning && (
          <div className="no-print mb-5 p-3.5 bg-[#D99722]/10 border border-[#D99722]/30 rounded-lg text-xs text-[#172338]">
            Firestore appears offline or unreachable. Check your Firebase configuration or
            network connection.
          </div>
        )}

        {activeTab === 'dashboard' && (
          <Dashboard
            invoices={invoices}
            payments={payments}
            jobCostings={jobCostings}
            expenses={expenses}
            settings={activeSettings}
            onNavigate={setActiveTab}
            onQuickCreateInvoice={openQuickCreateInvoice}
            onQuickAddExpense={openQuickAddExpense}
            onQuickRecordPayment={openQuickRecordPayment}
          />
        )}

        {activeTab === 'customers' && (
          <Customers
            uid={user.uid}
            customers={customers}
            invoices={invoices}
            payments={payments}
            jobCostings={jobCostings}
            settings={activeSettings}
            onNotify={notify}
          />
        )}

        {activeTab === 'invoices' && (
          <Invoices
            uid={user.uid}
            invoices={invoices}
            customers={customers}
            payments={payments}
            settings={activeSettings}
            onNotify={notify}
            onGoToCustomers={() => setActiveTab('customers')}
            newInvoiceSignal={newInvoiceSignal}
          />
        )}

        {activeTab === 'calculator' && (
          <MaterialCalculator
            uid={user.uid}
            jobCostings={jobCostings}
            customers={customers}
            invoices={invoices}
            settings={activeSettings}
            onNotify={notify}
          />
        )}

        {activeTab === 'expenses' && (
          <Expenses
            uid={user.uid}
            expenses={expenses}
            settings={activeSettings}
            onNotify={notify}
            openAddSignal={addExpenseSignal}
          />
        )}

        {activeTab === 'payments' && (
          <Payments
            uid={user.uid}
            invoices={invoices}
            payments={payments}
            settings={activeSettings}
            onNotify={notify}
            openRecordSignal={recordPaymentSignal}
          />
        )}

        {activeTab === 'pnl' && (
          <MonthlyPnL
            invoices={invoices}
            payments={payments}
            jobCostings={jobCostings}
            expenses={expenses}
            settings={activeSettings}
          />
        )}

        {activeTab === 'reports' && (
          <MonthEndReports
            invoices={invoices}
            payments={payments}
            jobCostings={jobCostings}
            expenses={expenses}
            settings={activeSettings}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            uid={user.uid}
            userEmail={user.email}
            emailVerified={user.emailVerified}
            settings={activeSettings}
            onNotify={notify}
          />
        )}
      </Layout>

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={`no-print fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg max-w-sm ${
            toast.type === 'error'
              ? 'bg-[#D64545] text-white border-[#B93838]'
              : 'bg-[#0B1F3A] text-white border-[#071629]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

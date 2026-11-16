import { useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Calculator,
  BarChart3,
  Lock,
} from 'lucide-react';
import { signInWithGoogle } from '../firebase';
import { useBrandLogos } from '../hooks/useBrandLogos';

interface AuthScreenProps {
  authError: string | null;
  onClearAuthError?: () => void;
}

function formatGoogleSignInError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In was closed before completion. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Previous sign-in request was cancelled. Please click Continue with Google again.';
    case 'auth/popup-blocked':
      return 'Sign-in pop-up was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error during Google Sign-In. Please check your internet connection and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication yet. Add it under Firebase Console → Authentication → Settings → Authorized domains.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method. Please use your authorized Google account.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'Google Sign-In failed. Please try again.';
  }
}

export function AuthScreen({ authError, onClearAuthError }: AuthScreenProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { whiteLogoSrc } = useBrandLogos(null);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setLocalError(null);
    onClearAuthError?.();
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(formatGoogleSignInError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col lg:flex-row">
      {/* Left Deep Navy Brand Panel */}
      <div className="lg:w-1/2 bg-[#071629] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3.5">
            {whiteLogoSrc ? (
              <img
                src={whiteLogoSrc}
                alt="Netzone"
                className="h-11 w-auto max-w-[135px] object-contain shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#163A63] border border-white/15 flex items-center justify-center font-semibold text-white text-lg">
                N
              </div>
            )}
            <div>
              <span className="block text-lg font-semibold tracking-tight text-white leading-tight">
                Netzone
              </span>
              <span className="block text-xs text-[#9FB4CE]">Business Manager</span>
            </div>
          </div>

          <div className="mt-12 lg:mt-20 max-w-lg">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight [text-wrap:balance]">
              Operations and accounting built for mesh, frames, doors, and blinds.
            </h1>
            <p className="mt-4 text-[#DCE4EF] text-base leading-relaxed">
              Track customer records, issue normal invoices without GST complexity, calculate
              job-wise material and installation costs, and reconcile cash collected against
              monthly profit and loss.
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-8 border-t border-[#163A63]">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-[#E8EFF8] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Normal Invoices &amp; PDFs</p>
              <p className="text-xs text-[#9FB4CE] mt-1">
                Advance tracking, balance due, print layout, and downloadable PDFs.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Calculator className="w-5 h-5 text-[#E8EFF8] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Job Cost Calculator</p>
              <p className="text-xs text-[#9FB4CE] mt-1">
                Mosquito mesh, aluminium frames, accessories, labour, and transport.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <BarChart3 className="w-5 h-5 text-[#E8EFF8] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Monthly P&amp;L &amp; Reports</p>
              <p className="text-xs text-[#9FB4CE] mt-1">
                Zero double-counting between invoiced sales, cash receipts, and costs.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#E8EFF8] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Google Auth Protected</p>
              <p className="text-xs text-[#9FB4CE] mt-1">
                Verified Google Sign-In with owner-only database security rules.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-[#DCE4EF] rounded-xl p-8 shadow-[0_4px_20px_rgba(11,31,58,0.06)]">
          <div className="flex items-center justify-between text-xs font-medium text-[#163A63] mb-3">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Authorized Google Sign-In</span>
            </span>
          </div>
          <h2 className="text-2xl font-semibold text-[#0B1F3A] tracking-tight">
            Sign in to Netzone
          </h2>
          <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
            Sign in with your authorized Google account to open the Netzone dashboard.
          </p>

          {displayError && (
            <div
              role="alert"
              className="mt-5 p-3.5 bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg text-sm text-[#D64545]"
            >
              {displayError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="mt-6 w-full min-h-[46px] flex items-center justify-center gap-3 px-4 py-3 bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.77 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.91z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-1.99 3.72-4.93 3.72-8.69z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.7-2.87c-.98.66-2.23 1.06-3.58 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
            </svg>
            <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          <p className="mt-6 text-xs text-[#64748B] leading-relaxed">
            Protected by Firebase Google Authentication and database security rules. Only
            authorized Netzone accounts can access invoices, customer records, payments, and
            financial reports.
          </p>
        </div>
      </div>
    </div>
  );
}

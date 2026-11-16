import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { BusinessSettings } from '../types';
import { BLUEPRINT_LIMITS, generateInvoiceNumber } from '../utils/format';
import {
  updateBusinessLogo,
  updateBusinessSettings,
} from '../services/firestoreService';
import {
  clearLogoCaches,
  processUploadedLogo,
  type ProcessedLogoResult,
} from '../utils/logo';
import { useBrandLogos } from '../hooks/useBrandLogos';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsViewProps {
  uid: string;
  userEmail?: string | null;
  emailVerified?: boolean;
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

export function SettingsView({
  uid,
  userEmail,
  emailVerified = true,
  settings,
  onNotify,
}: SettingsViewProps) {
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [saving, setSaving] = useState(false);

  // Company Logo Upload & White Conversion Confirmation State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { originalLogoSrc, whiteLogoSrc, isCustomLogo } = useBrandLogos(settings);
  const [processingLogo, setProcessingLogo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<ProcessedLogoResult | null>(null);
  const [bgThreshold, setBgThreshold] = useState<number>(38);
  const [trimPadding, setTrimPadding] = useState<boolean>(true);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const isAuthorizedAdmin = emailVerified && Boolean(uid);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setAddress(settings.address);
    setPhone(settings.phone);
    setEmail(settings.email);
    setInvoicePrefix(settings.invoicePrefix);
    setCurrencySymbol(settings.currencySymbol);
    setCurrencyCode(settings.currencyCode);
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !invoicePrefix.trim()) {
      onNotify('Business name and invoice prefix are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateBusinessSettings(uid, {
        businessName,
        address,
        phone,
        email,
        invoicePrefix,
        currencySymbol,
        currencyCode,
      });
      onNotify('Business settings saved to Cloud Firestore.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyLogoToCloud = async (logoUrl: string, logoWhiteUrl: string, msg: string) => {
    setSavingLogo(true);
    try {
      await updateBusinessLogo(uid, { logoUrl, logoWhiteUrl });
      clearLogoCaches();
      setPendingFile(null);
      setPendingPreview(null);
      onNotify(msg, 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to save logo to Cloud Firestore.',
        'error'
      );
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSelectLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isAuthorizedAdmin) {
      onNotify('Only a verified workspace administrator can update the company logo.', 'error');
      return;
    }

    setProcessingLogo(true);
    const defaultThreshold = 38;
    const defaultTrim = true;
    setBgThreshold(defaultThreshold);
    setTrimPadding(defaultTrim);

    try {
      const result = await processUploadedLogo(file, {
        bgThreshold: defaultThreshold,
        trimTransparentMargin: defaultTrim,
      });

      if (!result.needsConfirmation) {
        // Clean transparent dark logo: apply immediately across UI & PDFs
        await applyLogoToCloud(
          result.originalDataUrl,
          result.whiteDataUrl,
          'Company logo and pure-white sidebar version saved to Firestore.'
        );
      } else {
        // Opaque background or ambiguous conversion: require user preview & confirmation
        setPendingFile(file);
        setPendingPreview(result);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not process the selected logo file.',
        'error'
      );
    } finally {
      setProcessingLogo(false);
    }
  };

  const reprocessPendingLogo = async (nextThreshold: number, nextTrim: boolean) => {
    if (!pendingFile) return;
    setBgThreshold(nextThreshold);
    setTrimPadding(nextTrim);
    setProcessingLogo(true);
    try {
      const updated = await processUploadedLogo(pendingFile, {
        bgThreshold: nextThreshold,
        trimTransparentMargin: nextTrim,
      });
      setPendingPreview(updated);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to update white logo preview.',
        'error'
      );
    } finally {
      setProcessingLogo(false);
    }
  };

  const handleConfirmPendingLogo = async () => {
    if (!pendingPreview) return;
    await applyLogoToCloud(
      pendingPreview.originalDataUrl,
      pendingPreview.whiteDataUrl,
      'Custom logo and confirmed white version saved to Firestore.'
    );
  };

  const handleRestoreDefaultLogo = async () => {
    setConfirmRestoreOpen(false);
    await applyLogoToCloud('', '', 'Restored default Netzone company logo.');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* COMPANY LOGO UPLOAD & PREVIEW */}
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-6 shadow-[0_1px_3px_rgba(11,31,58,0.05)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DCE4EF]">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Company Logo &amp; Brand Identity
              </h2>
              <p className="text-xs text-[#64748B] mt-1">
                Upload your exact logo (PNG, JPG, SVG, or WebP). Used on every invoice PDF, print
                sheet, and automatically converted to pure white for the navy sidebar.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E8EFF8] text-[#0B1F3A] text-xs font-medium shrink-0 self-start">
              <ShieldCheck className="w-3.5 h-3.5 text-[#163A63]" />
              <span>Admin Verified</span>
            </span>
          </div>

          {!isAuthorizedAdmin && (
            <div className="p-3.5 rounded-lg bg-[#D64545]/10 border border-[#D64545]/30 text-xs text-[#D64545]">
              Your Google account email is not verified. Only verified workspace administrators can
              replace the company logo.
            </div>
          )}

          {/* Current Saved Logo Previews (Light & Dark Navy) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-[#DCE4EF] rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-[#0B1F3A]">
                  Original Logo (Invoices &amp; White UI)
                </span>
                <span className="text-[11px] text-[#64748B]">
                  {isCustomLogo ? 'Custom Saved' : 'Default Netzone'}
                </span>
              </div>
              <div className="h-28 rounded-lg border border-dashed border-[#DCE4EF] bg-white flex items-center justify-center p-3">
                {originalLogoSrc ? (
                  <img
                    src={originalLogoSrc}
                    alt="Original company logo"
                    className="max-h-full max-w-full w-auto h-auto object-contain"
                  />
                ) : (
                  <span className="text-xs text-[#64748B]">No logo loaded</span>
                )}
              </div>
            </div>

            <div className="border border-[#071629] rounded-xl p-4 bg-[#0B1F3A]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-white">
                  White Logo (Dark Navy Sidebar)
                </span>
                <span className="text-[11px] text-[#B8CAE0]">Auto Transparent</span>
              </div>
              <div className="h-28 rounded-lg border border-white/15 bg-[#071629] flex items-center justify-center p-3">
                {whiteLogoSrc ? (
                  <img
                    src={whiteLogoSrc}
                    alt="White logo on dark navy"
                    className="max-h-full max-w-full w-auto h-auto object-contain"
                  />
                ) : (
                  <span className="text-xs text-[#9FB4CE]">Generating white preview...</span>
                )}
              </div>
            </div>
          </div>

          {/* Pending Confirmation Workflow (shown when opaque background or uncertain conversion) */}
          {pendingPreview && (
            <div className="border-2 border-[#D99722]/60 bg-[#D99722]/5 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#D99722] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1F3A]">
                    Confirm White Logo Conversion Before Applying
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
                    {pendingPreview.warningReason ||
                      'Please verify that the white version below looks clean on dark navy with transparent background.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#DCE4EF] bg-white p-3">
                  <p className="text-[11px] font-medium text-[#64748B] mb-2">
                    Uploaded Original Preview
                  </p>
                  <div className="h-24 flex items-center justify-center">
                    <img
                      src={pendingPreview.originalDataUrl}
                      alt="Uploaded logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-[#071629] bg-[#0B1F3A] p-3">
                  <p className="text-[11px] font-medium text-[#CBD8E8] mb-2">
                    Generated White Preview (on Navy)
                  </p>
                  <div className="h-24 flex items-center justify-center">
                    <img
                      src={pendingPreview.whiteDataUrl}
                      alt="Converted white logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {!pendingPreview.hasTransparency && (
                <div className="bg-white border border-[#DCE4EF] rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#0B1F3A]">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Background Removal Sensitivity
                    </span>
                    <span className="font-mono-num text-[#64748B]">{bgThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={110}
                    step={2}
                    value={bgThreshold}
                    disabled={processingLogo}
                    onChange={(e) => reprocessPendingLogo(Number(e.target.value), trimPadding)}
                    className="w-full accent-[#0B1F3A] cursor-pointer"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-[#172338] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trimPadding}
                      disabled={processingLogo}
                      onChange={(e) => reprocessPendingLogo(bgThreshold, e.target.checked)}
                      className="w-4 h-4 rounded border-[#DCE4EF] text-[#0B1F3A]"
                    />
                    <span>Trim empty outer margin around converted logo</span>
                  </label>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={savingLogo || processingLogo}
                  onClick={handleConfirmPendingLogo}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingLogo ? 'Saving...' : 'Confirm & Apply White Logo'}</span>
                </button>
                <button
                  type="button"
                  disabled={savingLogo}
                  onClick={() => {
                    setPendingFile(null);
                    setPendingPreview(null);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#172338] text-sm font-medium rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Upload / Replace / Restore Action Buttons */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleSelectLogoFile}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!isAuthorizedAdmin || processingLogo || savingLogo}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {isCustomLogo ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <ImagePlus className="w-4 h-4" />
              )}
              <span>
                {processingLogo
                  ? 'Processing Logo...'
                  : savingLogo
                  ? 'Saving to Cloud...'
                  : isCustomLogo
                  ? 'Replace Logo'
                  : 'Upload Logo'}
              </span>
            </button>

            {isCustomLogo && (
              <button
                type="button"
                disabled={!isAuthorizedAdmin || savingLogo}
                onClick={() => setConfirmRestoreOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#F4F7FB] disabled:opacity-60 text-[#172338] text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restore Default Logo</span>
              </button>
            )}

            <span className="text-xs text-[#64748B]">
              Supports PNG, JPG, SVG, WebP (max 5 MB). Aspect ratio is always preserved.
            </span>
          </div>
        </div>

        {/* BUSINESS PROFILE & INVOICE SETTINGS FORM */}
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-6 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Business Profile &amp; Invoice Settings
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            These details appear on all printed invoices, PDF bills, and Month-End Reports.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#172338] mb-1">
                Business Name *
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.maxName}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Netzone"
                className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172338] mb-1">
                Workshop / Office Address
              </label>
              <textarea
                rows={2}
                maxLength={BLUEPRINT_LIMITS.maxAddress}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, Area, District, Tamil Nadu - Pincode"
                className="w-full px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Business Phone Number
                </label>
                <input
                  type="tel"
                  maxLength={25}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98400 00000"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Business Email
                </label>
                <input
                  type="email"
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@netzone.in"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Invoice Prefix *
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.maxPrefix}
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                  placeholder="NZ"
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
                <p className="mt-1 text-[11px] text-[#64748B]">
                  Next: {generateInvoiceNumber(invoicePrefix || 'NZ', settings.nextInvoiceSeq || 1)}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Default Currency
                </label>
                <select
                  value={currencyCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setCurrencyCode(code);
                    setCurrencySymbol(code === 'INR' ? '₹' : code === 'USD' ? '$' : '₹');
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                >
                  <option value="INR">INR (₹) — Indian Rupee</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Security & Database Summary */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-6 space-y-4 self-start shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <div className="flex items-center gap-2 text-[#0B1F3A]">
          <ShieldCheck className="w-5 h-5 text-[#163A63]" />
          <h3 className="text-sm font-semibold text-[#0B1F3A]">
            Database &amp; Security Architecture
          </h3>
        </div>
        <div className="text-xs text-[#64748B] space-y-2.5 leading-relaxed">
          <p>
            <strong className="text-[#172338]">Cloud Persistence:</strong> Connected to Firebase Cloud
            Firestore. Every customer, invoice, job cost, expense, payment, and company logo is
            stored permanently in the cloud.
          </p>
          <p>
            <strong className="text-[#172338]">Administrator Access:</strong>{' '}
            {userEmail ? `Signed in as ${userEmail}. ` : ''}
            Logo replacement and workspace configuration require verified Google Sign-In.
          </p>
          <p>
            <strong className="text-[#172338]">Owner-Only Rules:</strong> Firestore security rules
            enforce strict owner-only access (`ownerId == request.auth.uid`) and schema validation
            on every write.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Restore Default Netzone Logo?"
        message="This will remove your custom uploaded logo and restore the default Netzone company logo across the sidebar and all future PDFs."
        confirmLabel="Restore Default"
        busy={savingLogo}
        onConfirm={handleRestoreDefaultLogo}
        onCancel={() => !savingLogo && setConfirmRestoreOpen(false)}
      />
    </div>
  );
}

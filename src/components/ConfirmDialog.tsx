import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60"
    >
      <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                tone === 'danger'
                  ? 'bg-[#D64545]/10 text-[#D64545]'
                  : 'bg-[#E8EFF8] text-[#0B1F3A]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-semibold text-[#0B1F3A]"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm text-[#64748B] leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation"
            className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-[#172338] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 cursor-pointer ${
              tone === 'danger'
                ? 'bg-[#D64545] hover:bg-[#b83636]'
                : 'bg-[#0B1F3A] hover:bg-[#163A63]'
            }`}
          >
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

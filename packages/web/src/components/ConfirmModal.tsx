import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/focusTrap';

export interface ConfirmProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  withReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  withReason = false,
  reasonPlaceholder = 'Reason…',
  onConfirm,
  onClose,
}: ConfirmProps) {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, open);

  useEffect(() => {
    if (!open) return;
    setReason('');
    const id = window.setTimeout(() => {
      // Prefer the reason input when the modal asks for one; otherwise focus trap default.
      if (withReason) inputRef.current?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [open, onClose, withReason]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div id="confirm-title" className="modal-title">{title}</div>
        </div>
        <div className="modal-body">
          {body}
          {withReason && (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              rows={3}
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>{cancelLabel}</button>
          <button
            className={tone === 'danger' ? 'btn danger' : 'btn primary'}
            onClick={() => onConfirm(withReason ? reason.trim() || undefined : undefined)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

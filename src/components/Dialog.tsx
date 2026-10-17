import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onCancel={onClose}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        backdropPressed.current =
          e.target === e.currentTarget &&
          (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      }}
      onClick={(e) => {
        const startedOnBackdrop = backdropPressed.current;
        backdropPressed.current = false;
        if (startedOnBackdrop && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

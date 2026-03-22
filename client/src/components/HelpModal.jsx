"use client";

/**
 * HelpModal
 * Props: open (bool), onClose (fn), title (string), children (node)
 */
export default function HelpModal({ open, onClose, title, children }) {
    if (!open) return null;
    return (
        <dialog open className="modal modal-middle" aria-modal="true" aria-label={title}>
            <div className="modal-box">
                <h3 className="font-bold text-lg mb-2">{title}</h3>
                <div className="mb-4">{children}</div>
                <div className="modal-action">
                    <button className="btn btn-primary" onClick={onClose}>Close</button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button aria-label="Close help modal">close</button>
            </form>
        </dialog>
    );
}

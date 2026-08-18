"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Icon } from "./icon";

export type ToastInput = {
  readonly title: string;
  readonly description?: string;
  readonly href?: string;
  readonly tone?: "neutral" | "success" | "danger";
};

type Toast = ToastInput & { readonly identifier: number };

type ToastContextValue = {
  readonly showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastLifetimeMilliseconds = 4500;

export const ToastProvider = ({ children }: { readonly children: ReactNode }) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((identifier: number) => {
    setToasts((current) =>
      current.filter((toast) => toast.identifier !== identifier),
    );
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const identifier = Date.now() + Math.random();
      setToasts((current) => [...current, { ...input, identifier }]);
      window.setTimeout(() => dismiss(identifier), toastLifetimeMilliseconds);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.identifier}
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg bg-surface-raised px-3 py-2.5 shadow-popover animate-slide-up"
          >
            <Icon
              name={
                toast.tone === "danger"
                  ? "alert-circle"
                  : toast.tone === "success"
                    ? "check-circle"
                    : "circle"
              }
              size={16}
              className={
                toast.tone === "danger"
                  ? "mt-0.5 text-danger"
                  : toast.tone === "success"
                    ? "mt-0.5 text-success"
                    : "mt-0.5 text-foreground-tertiary"
              }
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {toast.href ? (
                  <Link href={toast.href} className="hover:underline">
                    {toast.title}
                  </Link>
                ) : (
                  toast.title
                )}
              </div>
              {toast.description ? (
                <div className="mt-0.5 text-xs text-foreground-tertiary">
                  {toast.description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.identifier)}
              className="rounded p-0.5 text-foreground-quaternary hover:text-foreground"
              aria-label="Dismiss"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
};

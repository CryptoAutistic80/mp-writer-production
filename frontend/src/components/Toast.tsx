"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ToastProps = {
  children: ReactNode;
  ariaLive?: "polite" | "assertive" | "off";
  role?: "status" | "alert";
  className?: string;
};

export function Toast({ children, ariaLive = "polite", role = "status", className }: ToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  const toastClass = className ? `app-toast ${className}` : "app-toast";

  return createPortal(
    <div className={toastClass} role={role} aria-live={ariaLive}>
      {children}
    </div>,
    document.body
  );
}

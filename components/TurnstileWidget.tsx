"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
      script.onerror = () => {
        loading = null;
        reject(new Error("turnstile failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/**
 * Cloudflare's "no soy un robot" check. Most visitors never see a puzzle: it passes on its own and hands
 * back a token (null when it expires or fails, so the form waits for a new one).
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The latest callbacks, without re-rendering the widget when the parent re-renders.
  const handlers = useRef({ onToken, onError });
  useEffect(() => {
    handlers.current = { onToken, onError };
  });

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId = api.render(box.current, {
          sitekey: siteKey,
          language: "es",
          theme: "auto",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": () => {
            handlers.current.onToken(null);
            handlers.current.onError("No se pudo hacer la verificación. Revisa tu conexión e inténtalo de nuevo.");
          },
        });
      })
      .catch(() => handlers.current.onError("No se pudo cargar la verificación. Revisa tu conexión y vuelve a abrir este paso."));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={box} className="min-h-[65px]" />;
}

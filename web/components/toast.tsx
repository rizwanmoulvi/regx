"use client"

import { type ReactNode, createContext, useCallback, useContext, useState } from "react"

type Toast = { id: number; kind: "ok" | "err" | "info"; title: string; body?: ReactNode }
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random()
    setToasts((x) => [...x, { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === "err" ? 12_000 : 8_000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="panel px-4 py-3 shadow-lg"
            style={{ borderLeft: `3px solid var(${t.kind === "ok" ? "--bid" : t.kind === "err" ? "--ask" : "--accent"})` }}
          >
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="mt-1 text-xs text-muted break-words">{t.body}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)

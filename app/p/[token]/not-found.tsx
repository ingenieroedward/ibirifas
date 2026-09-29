import { CrownIcon } from "@/components/icons/Crown";

export default function PublicRaffleNotFound() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <CrownIcon className="h-8 w-12 text-gold-400" />
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-text">
        Esta rifa ya no está disponible
      </h1>
      <p className="max-w-xs text-sm text-text-muted">
        El enlace cambió o se desactivó. Pídele al organizador el enlace actual.
      </p>
    </main>
  );
}

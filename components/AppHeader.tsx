import Link from "next/link";
import { CrownIcon } from "@/components/icons/Crown";
import { NotificationsButton } from "@/components/NotificationsButton";
import { PaymentsLink } from "@/components/PaymentsLink";

interface HeaderLink {
  href: string;
  label: string;
}

interface AppHeaderProps {
  userName: string;
  onLogout: () => void;
  title?: string;
  subtitle?: string;
  /** Small back-chevron button shown before the brand mark, e.g. back to the raffle picker. */
  backHref?: string;
  backLabel?: string;
  /** Extra pill-style nav links, e.g. "Mi equipo" or "Crear rifa". */
  links?: HeaderLink[];
  /** Show the notifications bell (only meaningful for users who belong to a raffle team). */
  notifications?: boolean;
}

/** Shared top bar for the non-grid screens (picker, empty state, forms, user management). */
export function AppHeader({
  userName,
  onLogout,
  title,
  subtitle,
  backHref,
  backLabel = "Atrás",
  links = [],
  notifications = false,
}: AppHeaderProps) {
  return (
    <header className="px-4 pt-safe sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            {backHref && (
              <Link
                href={backHref}
                aria-label={backLabel}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
              >
                <BackIcon className="h-4 w-4" />
              </Link>
            )}
            <CrownIcon className="h-5 w-8 text-gold-400" />
            <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">
              Ibirifas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/cuenta"
              aria-label={`Mi cuenta (${userName})`}
              className="max-w-[8rem] truncate rounded-full px-1 text-sm font-medium text-text-muted underline-offset-4 hover:underline"
            >
              {userName}
            </Link>
            {notifications && <PaymentsLink />}
            {notifications && <NotificationsButton />}
            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {title && (
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-text">
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}

        {links.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-gold-600/40 px-3.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

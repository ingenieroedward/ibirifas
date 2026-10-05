"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { RaffleForm } from "@/components/RaffleForm";
import { Spinner } from "@/components/Spinner";

export default function NewRafflePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Only an ORGANIZER can create a raffle — SELLER and SUPERADMIN never see this form.
  useEffect(() => {
    if (!authLoading && user && user.role !== "ORGANIZER") {
      router.replace(user.role === "SUPERADMIN" ? "/usuarios" : "/rifas");
    }
  }, [authLoading, user, router]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (authLoading || !user || user.role !== "ORGANIZER") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Nueva rifa"
        subtitle="Define los datos y crea los números de la rifa."
        backHref="/rifas"
        backLabel="Volver a tus rifas"
      />

      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
        <RaffleForm mode="create" />
      </main>
    </div>
  );
}

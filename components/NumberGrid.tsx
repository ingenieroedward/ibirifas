import { useMemo } from "react";
import type { RaffleNumberDTO } from "@/lib/types";
import { NumberCell } from "@/components/NumberCell";

interface NumberGridProps {
  numbers: RaffleNumberDTO[];
  onSelect: (number: RaffleNumberDTO) => void;
}

export function NumberGrid({ numbers, onSelect }: NumberGridProps) {
  const sorted = useMemo(
    () => [...numbers].sort((a, b) => a.value - b.value),
    [numbers],
  );

  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-2.5 lg:grid-cols-10">
      {sorted.map((number) => (
        <NumberCell key={number.id} number={number} onTap={onSelect} />
      ))}
    </div>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn className helper — merges Tailwind classes
 * intelligently (later classes override earlier ones for the same
 * utility, e.g. `cn("p-2", "p-4")` → `"p-4"`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

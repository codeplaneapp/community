import { useContext } from "react";
import { NavigationContext } from "../providers/NavigationProvider.js";

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider");
  return ctx;
}

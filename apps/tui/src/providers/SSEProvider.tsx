import { createContext, useContext } from "react";

export interface SSEEvent {
  type: string;
  data: any;
}

const SSEContext = createContext<null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  return <SSEContext.Provider value={null}>{children}</SSEContext.Provider>;
}

export function useSSE(channel: string) {
  return null;
}

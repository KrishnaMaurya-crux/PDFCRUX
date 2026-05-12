"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider — wraps the app with next-themes for Light/Dark mode.
 * attribute="class" adds/removes `dark` class on <html> to match CSS variables.
 * defaultTheme="system" follows OS preference on first visit.
 * disableTransitionOnChange prevents brief flash when toggling.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      {children}
    </NextThemesProvider>
  );
}

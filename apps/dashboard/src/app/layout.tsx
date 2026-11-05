import type { Metadata } from 'next';
import './globals.css';
import { ChunkErrorListener } from '../components/chunk-error-listener';
import { ThemeProvider } from '../components/theme-provider';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from '../components/app-shell';
import { GlobalLoader } from '../components/global-loader';

export const metadata: Metadata = {
  title: 'Attendance Platform | Control Plane',
  description: 'Central Enterprise Attendance Device Integration & Dispatch Control Center',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('eap-ui-theme') || 'light';
                if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                } else {
                  document.documentElement.classList.add('light');
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        className="flex h-screen overflow-hidden bg-background text-foreground antialiased font-sans"
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light">
          <ChunkErrorListener />
          <AuthProvider>
            <GlobalLoader />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

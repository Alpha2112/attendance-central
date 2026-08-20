import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '../components/sidebar';
import { Header } from '../components/header';
import { ChunkErrorListener } from '../components/chunk-error-listener';
import { ThemeProvider } from '../components/theme-provider';

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
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
            <Header />
            <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background/50">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

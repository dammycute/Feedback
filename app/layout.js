import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

export const metadata = {
  title: 'TriageOps · Feedback Board',
  description: 'Internal feedback board for Fixer and Clients, with two-person fix verification.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

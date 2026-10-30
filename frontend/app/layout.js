import './globals.css';
import { AppProvider } from '@/components/Providers';

export const metadata = {
  title: 'Sistem Nilai - Informatika Universitas Siliwangi',
  description: 'Praktikum Zero Trust Security',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}

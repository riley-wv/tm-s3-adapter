import './globals.css';

export const metadata = {
  title: 'TM Adapter Admin',
  description: 'TM Adapter dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

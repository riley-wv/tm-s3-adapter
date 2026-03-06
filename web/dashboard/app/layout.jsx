import './globals.css';

export const metadata = {
  title: 'TM Adapter Admin',
  description: 'TM Adapter dashboard'
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('tm-theme')||'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

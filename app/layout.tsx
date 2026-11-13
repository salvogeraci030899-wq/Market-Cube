export const metadata = {
  title: 'Market Cube',
  description: 'Il sentiment del mercato crypto in un cubo 3D. Dati pubblici e gratuiti.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" style={{ backgroundColor: '#000' }}>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000', color: '#fff' }}>{children}</body>
    </html>
  );
}

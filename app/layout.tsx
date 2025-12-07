export const metadata = {
  title: 'Market Cube Pro',
  description: 'Professional crypto market sentiment visualization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#000'
      }}>
        {children}
      </body>
    </html>
  );
}
export const metadata = {
  title: 'Market Cube PRO - Real-time Crypto Sentiment',
  description: 'Professional crypto market sentiment visualization with real-time data from 3 sources',
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
        backgroundColor: '#000',
        color: '#fff'
      }}>
        {children}
      </body>
    </html>
  );
}
// app/page.tsx
'use client';

import dynamic from 'next/dynamic';

// Import dinamico con fallback
const MarketCube = dynamic(
  () => import('@/components/MarketCube/MarketCube'),
  { 
    ssr: false,
    loading: () => (
      <div style={{
        backgroundColor: '#000',
        color: '#fff',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#6c5ce7',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '20px' }}>Loading Market Cube...</p>
        
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }
);

export default function Home() {
  return <MarketCube />;
}
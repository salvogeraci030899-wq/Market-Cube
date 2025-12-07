// app/page.tsx
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Import dinamico
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
        <p style={{ marginTop: '20px' }}>Loading Market Cube Pro...</p>
        
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
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  
  useEffect(() => {
    // Controlla se c'è una license key nell'URL
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get('key');
    
    // Controlla nel localStorage
    const keyFromStorage = localStorage.getItem('marketCubeLicense');
    
    const key = keyFromUrl || keyFromStorage;
    
    if (key) {
      setLicenseKey(key);
      // Salva nel localStorage se dall'URL
      if (keyFromUrl) {
        localStorage.setItem('marketCubeLicense', keyFromUrl);
        // Rimuovi key dall'URL per sicurezza
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);
  
  return (
    <>
      <MarketCube licenseKey={licenseKey} />
      
      {/* Modal per inserire license key */}
      {!licenseKey && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <h2 style={{ color: '#fff', marginBottom: '30px' }}>
            🔐 Enter Your License Key
          </h2>
          
          <input
            type="text"
            placeholder="MC-XXXX-XXXX-XXXX"
            style={{
              padding: '15px 20px',
              width: '300px',
              maxWidth: '90%',
              borderRadius: '10px',
              border: '2px solid #6c5ce7',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '16px',
              textAlign: 'center',
              marginBottom: '20px'
            }}
            id="licenseInput"
          />
          
          <button
            onClick={() => {
              const input = document.getElementById('licenseInput') as HTMLInputElement;
              if (input.value) {
                localStorage.setItem('marketCubeLicense', input.value);
                setLicenseKey(input.value);
                window.location.reload();
              }
            }}
            style={{
              padding: '15px 40px',
              backgroundColor: '#6c5ce7',
              color: '#fff',
              border: 'none',
              borderRadius: '50px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '20px'
            }}
          >
            Activate PRO Version
          </button>
          
          <button
            onClick={() => {
              // Continua in demo
              setLicenseKey('demo');
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              color: '#999',
              border: '1px solid #666',
              borderRadius: '50px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Continue in Demo Mode
          </button>
          
          <div style={{ marginTop: '30px', textAlign: 'center' }}>
            <a 
              href="/purchase" 
              style={{ color: '#6c5ce7', textDecoration: 'none' }}
            >
              👉 Don't have a license? Get PRO Version
            </a>
          </div>
        </div>
      )}
    </>
  );
}
// components/MarketCube/MarketCube.tsx
'use client';

import { useEffect, useRef } from 'react';

export default function MarketCube() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  // Animazione semplice
  useEffect(() => {
    if (!cubeRef.current) return;
    
    let rotation = 0;
    
    const animate = () => {
      rotation += 0.5;
      
      if (cubeRef.current) {
        cubeRef.current.style.transform = `
          rotateX(15deg)
          rotateY(${rotation}deg)
        `;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
  const color = '#6c5ce7'; // Viola fisso per test

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      backgroundColor: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <h1 style={{
        color: '#fff',
        fontSize: '2.5rem',
        fontWeight: '300',
        letterSpacing: '12px',
        textTransform: 'uppercase',
        position: 'absolute',
        top: '30px',
        left: '0',
        width: '100%',
        textAlign: 'center',
        zIndex: '10'
      }}>
        MARKET CUBE
      </h1>
      
      <div style={{
        width: '280px',
        height: '280px',
        position: 'relative',
        transformStyle: 'preserve-3d',
        perspective: '1000px'
      }} ref={sceneRef}>
        <div ref={cubeRef} style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d'
        }}>
          {faces.map((face, index) => (
            <div
              key={face}
              style={{
                position: 'absolute',
                width: '280px',
                height: '280px',
                backgroundColor: color,
                border: '1px solid rgba(255,255,255,0.1)',
                opacity: '0.8',
                ...(face === 'front' && { transform: 'translateZ(140px)' }),
                ...(face === 'back' && { transform: 'rotateY(180deg) translateZ(140px)' }),
                ...(face === 'right' && { transform: 'rotateY(90deg) translateZ(140px)' }),
                ...(face === 'left' && { transform: 'rotateY(-90deg) translateZ(140px)' }),
                ...(face === 'top' && { transform: 'rotateX(90deg) translateZ(140px)' }),
                ...(face === 'bottom' && { transform: 'rotateX(-90deg) translateZ(140px)' })
              }}
            />
          ))}
        </div>
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '0',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '15px'
      }}>
        <div style={{
          display: 'flex',
          gap: '20px',
          color: '#fff',
          marginBottom: '10px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', opacity: '0.7' }}>Sentiment</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>65.2</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', opacity: '0.7' }}>Volatility</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>1.4x</div>
          </div>
        </div>
        
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          padding: '12px 30px',
          borderRadius: '50px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: '500'
        }}>
          🔄 Refresh Data
        </div>
        
        <div style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.8rem',
          fontStyle: 'italic',
          textAlign: 'center',
          marginTop: '10px'
        }}>
          Demo Mode - Upgrade for real-time data
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './components/Scene';

function useScrollProgress() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollVelocity, setScrollVelocity] = useState(0);
  const lastScrollRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      const clamped = Math.max(0, Math.min(1, progress));
      setScrollProgress(clamped);

      // Calculate velocity
      const now = performance.now();
      const dt = Math.max(now - lastTimeRef.current, 16) / 1000;
      const vel = (clamped - lastScrollRef.current) / dt;
      setScrollVelocity(vel);
      lastScrollRef.current = clamped;
      lastTimeRef.current = now;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return { scrollProgress, scrollVelocity };
}

function usePhotoUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const photoParam = params.get('photo');
    if (photoParam) {
      try {
        new URL(photoParam);
        setUrl(photoParam);
      } catch {
        console.warn('Invalid photo URL:', photoParam);
      }
    }
  }, []);

  return url;
}

function usePerformanceTier(): { tier: 'high' | 'medium' | 'low'; reducedMotion: boolean } {
  const [result, setResult] = useState<{ tier: 'high' | 'medium' | 'low'; reducedMotion: boolean }>({ tier: 'high', reducedMotion: false });

  useEffect(() => {
    // Check prefers-reduced-motion
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedMotion = mq.matches;
    
    // Detect low-power device
    let tier: 'high' | 'medium' | 'low' = 'high';
    
    // Check for mobile / low memory
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency || 4;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    
    if (isMobile || (memory && memory < 4) || cores < 4) {
      tier = 'low';
    } else if ((memory && memory < 8) || cores < 8) {
      tier = 'medium';
    }
    
    setResult({ tier, reducedMotion });
    
    const handler = (e: MediaQueryListEvent) => {
      setResult(prev => ({ ...prev, reducedMotion: e.matches }));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return result;
}

export default function App() {
  const { scrollProgress, scrollVelocity } = useScrollProgress();
  const photoUrl = usePhotoUrl();
  const { tier, reducedMotion } = usePerformanceTier();
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    if (scrollProgress > 0.05) setShowHint(false);
  }, [scrollProgress]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '300vh', // 3x viewport height for scroll range
      position: 'relative',
      background: '#0a0a1a',
    }}>
      {/* Fixed 3D canvas */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
      }}>
        <Canvas
          camera={{ position: [0, 0.2, 2.2], fov: 50 }}
          dpr={tier === 'low' ? [0.75, 1] : [1, 2]}
          gl={{
            antialias: tier !== 'low',
            alpha: false,
            powerPreference: tier === 'low' ? 'default' : 'high-performance',
          }}
        >
          <Scene
            scrollProgress={reducedMotion ? 0 : scrollProgress}
            scrollVelocity={scrollVelocity}
            textureUrl={photoUrl}
            reducedMotion={reducedMotion}
          />
        </Canvas>
      </div>

      {/* Scroll hint overlay */}
      {showHint && (
        <div style={{
          position: 'fixed',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'monospace',
          fontSize: '14px',
          textAlign: 'center',
          pointerEvents: 'none',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          ↓ Scroll to lift the photo from the bath ↓
        </div>
      )}

      {/* Scroll progress indicator */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 10,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'monospace',
        fontSize: '11px',
      }}>
        {Math.round(scrollProgress * 100)}%
      </div>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a1a; overflow-x: hidden; }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

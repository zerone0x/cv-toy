import React, { useState, useRef, useEffect } from 'react';
import { Camera, Play, Hand, Sparkles, Bug, Heart, Utensils, Pointer } from 'lucide-react';

interface PetPosition {
  x: number;
  y: number;
}

interface HandDetectionState {
  isHandVisible: boolean;
  handCount: number;
  lastDetectionTime: number;
}

interface GestureInfo {
  isPinching: boolean;
  isOpenHand: boolean;
  isFist: boolean;
  isPointing: boolean;
  extendedFingers: string[];
  curlByFinger: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
}

const MEDIAPIPE_HANDS_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';
const MEDIAPIPE_DU_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils';

let mediapipeLoadPromise: Promise<{
  Hands: any;
  HAND_CONNECTIONS: any;
  drawConnectors: any;
  drawLandmarks: any;
}> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise(resolve => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.addEventListener('load', () => {
      s.setAttribute('data-loaded', 'true');
      resolve();
    });
    s.addEventListener('error', () => resolve());
    document.head.appendChild(s);
  });
}

async function ensureMediapipe(): Promise<{
  Hands: any;
  HAND_CONNECTIONS: any;
  drawConnectors: any;
  drawLandmarks: any;
}> {
  if (!mediapipeLoadPromise) {
    mediapipeLoadPromise = (async () => {
      (window as any).createMediapipeSolutionsWasm = { locateFile: (path: string) => `${MEDIAPIPE_HANDS_CDN_BASE}/${path}` };
      (window as any).createMediapipeSolutionsPackedAssets = { locateFile: (path: string) => `${MEDIAPIPE_HANDS_CDN_BASE}/${path}` };
      await Promise.all([
        loadScript(`${MEDIAPIPE_DU_CDN_BASE}/drawing_utils.js`),
        loadScript(`${MEDIAPIPE_HANDS_CDN_BASE}/hands.js`),
      ]);
      const Hands = (window as any).Hands;
      const HAND_CONNECTIONS = (window as any).HAND_CONNECTIONS;
      const drawConnectors = (window as any).drawConnectors;
      const drawLandmarks = (window as any).drawLandmarks;
      return { Hands, HAND_CONNECTIONS, drawConnectors, drawLandmarks };
    })();
  }
  return mediapipeLoadPromise;
}

const VirtualPet: React.FC = () => {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [petPosition, setPetPosition] = useState<PetPosition>({ x: 50, y: 80 });
  const [handDetection, setHandDetection] = useState<HandDetectionState>({
    isHandVisible: false,
    handCount: 0,
    lastDetectionTime: 0
  });
  const [gestureInfo, setGestureInfo] = useState<GestureInfo>({
    isPinching: false,
    isOpenHand: false,
    isFist: false,
    isPointing: false,
    extendedFingers: [],
    curlByFinger: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }
  });
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isPetting, setIsPetting] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [petToast, setPetToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const lastPetTimeRef = useRef(0);
  const lastFeedTimeRef = useRef(0);
  const lastPokeTimeRef = useRef(0);
  const pettingHideTimeoutRef = useRef<number | null>(null);
  const feedingHideTimeoutRef = useRef<number | null>(null);
  const pokingHideTimeoutRef = useRef<number | null>(null);
  const [isPoking, setIsPoking] = useState(false);
  const [isHighFiving, setIsHighFiving] = useState(false);
  const lastHighFiveTimeRef = useRef(0);
  const highFiveHideTimeoutRef = useRef<number | null>(null);
  const lastPalmRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petRef = useRef<HTMLImageElement>(null);
  const petPositionRef = useRef<PetPosition>({ x: 50, y: 80 });
  const isGrabbingRef = useRef(false);
  const grabOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  useEffect(() => { petPositionRef.current = petPosition; }, [petPosition]);
  useEffect(() => { isGrabbingRef.current = isGrabbing; }, [isGrabbing]);

  const showPetToast = (message: string) => {
    setPetToast({ visible: true, message });
    if (pettingHideTimeoutRef.current) {
      window.clearTimeout(pettingHideTimeoutRef.current);
    }
    pettingHideTimeoutRef.current = window.setTimeout(() => {
      setPetToast({ visible: false, message: '' });
    }, 1200);
  };

  const handlePetPoke = () => {
    if (Date.now() - lastPokeTimeRef.current > 500) {
      lastPokeTimeRef.current = Date.now();
      setIsPoking(true);
      showPetToast('Boop!');
      if (pokingHideTimeoutRef.current) {
        window.clearTimeout(pokingHideTimeoutRef.current);
      }
      pokingHideTimeoutRef.current = window.setTimeout(() => {
        setIsPoking(false);
      }, 350);
    }
  };

  const startCamera = async () => {
    setIsCameraOn(true);
  };

  useEffect(() => {
    if (!isCameraOn) return;

    let handsInstance: any = null;
    let animationId = 0;
    let sending = false;

    const initializeCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 640, 
            height: 480,
            facingMode: 'user'
          } 
        });
        
        if (videoRef.current) {
          (videoRef.current as any).srcObject = stream as MediaStream;
          await videoRef.current.play();
        }

        const { Hands, HAND_CONNECTIONS, drawConnectors, drawLandmarks } = await ensureMediapipe();

        handsInstance = new Hands({ locateFile: (file: string) => `${MEDIAPIPE_HANDS_CDN_BASE}/${file}` });
        handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        const distance = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
        const dot = (u: {x:number;y:number}, v: {x:number;y:number}) => u.x * v.x + u.y * v.y;
        const norm = (u: {x:number;y:number}) => Math.hypot(u.x, u.y);
        const angleBetween = (a1: any, a2: any, b1: any, b2: any) => {
          const u = { x: a2.x - a1.x, y: a2.y - a1.y };
          const v = { x: b2.x - b1.x, y: b2.y - b1.y };
          const d = Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v) || 1)));
          return Math.acos(d);
        };
        const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

        handsInstance.onResults((results: any) => {
          if (!videoRef.current || !canvasRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          const vW = videoRef.current.videoWidth;
          const vH = videoRef.current.videoHeight;
          if (canvas.width !== vW || canvas.height !== vH) {
            canvas.width = vW;
            canvas.height = vH;
          }
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const currentTime = Date.now();
          const count = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

          if (count > 0) {
            setHandDetection({ isHandVisible: true, handCount: count, lastDetectionTime: currentTime });

            const landmarks = results.multiHandLandmarks![0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const pinchPx = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
            const palmWidth = distance(landmarks[5], landmarks[17]) || 1e-6;
            const pinchRatio = distance(thumbTip, indexTip) / palmWidth;
            const isPinchingNow = pinchRatio < 0.4;

            const width = canvas.width;
            const height = canvas.height;
            const pinchX = (1 - pinchPx.x) * width;
            const pinchY = pinchPx.y * height;

            const petX = (petPositionRef.current.x / 100) * width;
            const petY = (petPositionRef.current.y / 100) * height;
            const nearRadius = Math.max(50, palmWidth * Math.min(width, height));
            const nearPet = Math.hypot(petX - pinchX, petY - pinchY) < nearRadius;

            const bowlX = width * 0.5;
            const bowlY = height * 0.88;
            const nearBowl = Math.hypot(bowlX - pinchX, bowlY - pinchY) < Math.max(60, nearRadius * 0.5);

            if (!isGrabbingRef.current && isPinchingNow) {
              if (nearBowl) {
                if (Date.now() - lastFeedTimeRef.current > 1200) {
                  lastFeedTimeRef.current = Date.now();
                  setIsFeeding(true);
                  showPetToast('Yum!');
                  if (feedingHideTimeoutRef.current) {
                    window.clearTimeout(feedingHideTimeoutRef.current);
                  }
                  feedingHideTimeoutRef.current = window.setTimeout(() => {
                    setIsFeeding(false);
                  }, 800);
                }
              } else if (nearPet) {
                setIsGrabbing(true);
                grabOffsetRef.current = { dx: petX - pinchX, dy: petY - pinchY };
              }
            }

            if (isGrabbingRef.current) {
              if (!isPinchingNow) {
                setIsGrabbing(false);
              } else {
                const nextX = clamp((pinchX + grabOffsetRef.current.dx) / width * 100, 0, 100);
                const nextY = clamp((pinchY + grabOffsetRef.current.dy) / height * 100, 0, 100);
                setPetPosition({ x: nextX, y: nextY });
              }
            }

            const wrist = landmarks[0];
            const fingerIndices = {
              thumb: { mcp: 1, pip: 2, dip: 3, tip: 4 },
              index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
              middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
              ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
              pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
            } as const;

            const curlByFinger = {
              thumb: clamp01(angleBetween(landmarks[fingerIndices.thumb.mcp], landmarks[fingerIndices.thumb.pip], landmarks[fingerIndices.thumb.pip], landmarks[fingerIndices.thumb.tip]) / Math.PI),
              index: clamp01(angleBetween(landmarks[fingerIndices.index.mcp], landmarks[fingerIndices.index.pip], landmarks[fingerIndices.index.pip], landmarks[fingerIndices.index.tip]) / Math.PI),
              middle: clamp01(angleBetween(landmarks[fingerIndices.middle.mcp], landmarks[fingerIndices.middle.pip], landmarks[fingerIndices.middle.pip], landmarks[fingerIndices.middle.tip]) / Math.PI),
              ring: clamp01(angleBetween(landmarks[fingerIndices.ring.mcp], landmarks[fingerIndices.ring.pip], landmarks[fingerIndices.ring.pip], landmarks[fingerIndices.ring.tip]) / Math.PI),
              pinky: clamp01(angleBetween(landmarks[fingerIndices.pinky.mcp], landmarks[fingerIndices.pinky.pip], landmarks[fingerIndices.pinky.pip], landmarks[fingerIndices.pinky.tip]) / Math.PI),
            };

            const isExtended = (tipIdx: number, pipIdx: number) => {
              const dTip = distance(wrist, landmarks[tipIdx]);
              const dPip = distance(wrist, landmarks[pipIdx]);
              return dTip - dPip > 0.07;
            };
            const extendedFlags = {
              thumb: isExtended(fingerIndices.thumb.tip, fingerIndices.thumb.pip) && curlByFinger.thumb < 0.35,
              index: isExtended(fingerIndices.index.tip, fingerIndices.index.pip) && curlByFinger.index < 0.35,
              middle: isExtended(fingerIndices.middle.tip, fingerIndices.middle.pip) && curlByFinger.middle < 0.35,
              ring: isExtended(fingerIndices.ring.tip, fingerIndices.ring.pip) && curlByFinger.ring < 0.35,
              pinky: isExtended(fingerIndices.pinky.tip, fingerIndices.pinky.pip) && curlByFinger.pinky < 0.35,
            };
            const extendedFingers = Object.entries(extendedFlags).filter(([, v]) => v).map(([k]) => k);

            const isOpenHand = extendedFingers.length >= 4;
            const isFist = extendedFingers.length <= 1 && Object.values(curlByFinger).every(v => v > 0.45);
            const isPointing = extendedFlags.index && !extendedFlags.middle && !extendedFlags.ring && !extendedFlags.pinky;

            setGestureInfo({
              isPinching: isPinchingNow,
              isOpenHand,
              isFist,
              isPointing,
              extendedFingers,
              curlByFinger
            });

            const palmCenter = {
              x: (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3,
              y: (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3,
            };
            const palmX = (1 - palmCenter.x) * width;
            const palmY = palmCenter.y * height;
            const palmNearPet = Math.hypot(petX - palmX, petY - palmY) < nearRadius * 0.9;

            if (!isGrabbingRef.current && isOpenHand && !isPinchingNow && palmNearPet) {
              setIsPetting(true);
              if (currentTime - lastPetTimeRef.current > 1000) {
                lastPetTimeRef.current = currentTime;
                const messages = [
                  'Purr... that feels nice!',
                  'So comfy!',
                  'Meow! More please!',
                  'Happy pet!',
                ];
                const message = messages[Math.floor(Math.random() * messages.length)];
                showPetToast(message);
              }
            } else {
              setIsPetting(false);
            }

            const prevPalm = lastPalmRef.current;
            if (!isGrabbingRef.current && isOpenHand && !isPinchingNow && palmNearPet && prevPalm) {
              const dt = Math.max(1, currentTime - prevPalm.time) / 1000;
              const vx = (palmX - prevPalm.x) / dt;
              const vy = (palmY - prevPalm.y) / dt;
              const speed = Math.hypot(vx, vy);
              const distPrev = Math.hypot(petX - prevPalm.x, petY - prevPalm.y);
              const distNow = Math.hypot(petX - palmX, petY - palmY);
              const approaching = distPrev - distNow > 12;
              const speedThreshold = 900;
              if (approaching && speed > speedThreshold && currentTime - lastHighFiveTimeRef.current > 1200) {
                lastHighFiveTimeRef.current = currentTime;
                setIsHighFiving(true);
                showPetToast('High five!');
                if (highFiveHideTimeoutRef.current) {
                  window.clearTimeout(highFiveHideTimeoutRef.current);
                }
                highFiveHideTimeoutRef.current = window.setTimeout(() => {
                  setIsHighFiving(false);
                }, 700);
              }
            }
            lastPalmRef.current = { x: palmX, y: palmY, time: currentTime };

            if (!isGrabbingRef.current && gestureInfo.isPointing && !isPinchingNow && nearPet) {
              if (Date.now() - lastPokeTimeRef.current > 1000) {
                lastPokeTimeRef.current = Date.now();
                showPetToast('Boop!');
              }
            }

            if (results.multiHandLandmarks) {
              for (const lm of results.multiHandLandmarks) {
                (drawConnectors as any)(ctx, lm, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                (drawLandmarks as any)(ctx, lm, { color: '#FF0000', lineWidth: 1 });
              }
            }
          } else {
            if (currentTime - handDetection.lastDetectionTime > 500) {
              setHandDetection(prev => ({ ...prev, isHandVisible: false, handCount: 0 }));
              setGestureInfo(prev => ({ ...prev, isPinching: false, isOpenHand: false, isFist: false, isPointing: false, extendedFingers: [] }));
              setIsGrabbing(false);
              setIsPetting(false);
              setIsFeeding(false);
              setIsHighFiving(false);
              lastPalmRef.current = null;
            }
          }
        });

        const loop = async () => {
          if (videoRef.current && handsInstance && !sending) {
            sending = true;
            await handsInstance.send({ image: videoRef.current });
            sending = false;
          }
          animationId = requestAnimationFrame(loop);
        };
        loop();
      } catch (error) {
        console.error('Error accessing camera:', error);
        setIsCameraOn(false);
      }
    };

    initializeCamera();

    return () => {
      if (videoRef.current && (videoRef.current as any).srcObject) {
        const stream = (videoRef.current as any).srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationId);
      if (handsInstance) handsInstance.close();
      if (pettingHideTimeoutRef.current) {
        window.clearTimeout(pettingHideTimeoutRef.current);
      }
      if (feedingHideTimeoutRef.current) {
        window.clearTimeout(feedingHideTimeoutRef.current);
      }
      if (highFiveHideTimeoutRef.current) {
        window.clearTimeout(highFiveHideTimeoutRef.current);
      }
      if (pokingHideTimeoutRef.current) {
        window.clearTimeout(pokingHideTimeoutRef.current);
      }
    };
  }, [isCameraOn]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-pink-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative w-full max-w-4xl">
        {!isCameraOn ? (
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 p-12 text-center overflow-hidden relative">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.18),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(236,72,153,0.18),transparent_60%)]" />
            <div className="relative mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 mb-6 shadow-lg shadow-purple-500/25">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold text-white mb-3 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent tracking-tight">
                Virtual Pet
              </h1>
              <p className="text-slate-300 text-lg leading-relaxed max-w-xl mx-auto">
                Meet your interactive virtual pet. Use hand gestures to play and interact through your camera.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto mb-10">
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-white/10 text-slate-200">
                <Hand className="w-4 h-4 text-purple-300" />
                <span className="text-sm">Gestures</span>
              </div>
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-white/10 text-slate-200">
                <Pointer className="w-4 h-4 text-pink-300" />
                <span className="text-sm">Poke</span>
              </div>
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-white/10 text-slate-200">
                <Utensils className="w-4 h-4 text-purple-300" />
                <span className="text-sm">Feed</span>
              </div>
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-white/10 text-slate-200">
                <Heart className="w-4 h-4 text-pink-300" />
                <span className="text-sm">Pet</span>
              </div>
            </div>
            
            <button
              onClick={startCamera}
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl hover:shadow-purple-500/25 focus:outline-none focus:ring-2 focus:ring-pink-400/40"
            >
              <Play className="w-6 h-6 transition-transform group-hover:scale-110" />
              Start Camera
            </button>
          </div>
        ) : (
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">
                Playing with your Virtual Pet
              </h2>
              
              <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-600/50 shadow-inner">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.12),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.12),transparent_60%)]" style={{ zIndex: 5 }} />

                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                  muted
                  autoPlay
                  playsInline
                  style={{ zIndex: 10 }}
                />
                
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full scale-x-[-1]"
                  style={{ zIndex: 20 }}
                />

                {(isPetting || isFeeding || isPoking || isHighFiving) && (
                  <div
                    className="absolute w-28 h-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.25),rgba(168,85,247,0.2)_40%,transparent_65%)] blur-md"
                    style={{ zIndex: 28, left: `${petPosition.x}%`, top: `${petPosition.y}%` }}
                  />
                )}
                
                <img
                  ref={petRef}
                  src="https://images.pexels.com/photos/1170986/pexels-photo-1170986.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=face"
                  alt="Virtual Pet Cat"
                  id="virtual-pet"
                  className={`absolute w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg transition-transform duration-300 ease-out transform hover:scale-110 ${(isPetting || isFeeding || isPoking) ? 'scale-110' : ''}`}
                  onClick={handlePetPoke}
                  onTouchStart={handlePetPoke}
                  style={{
                    zIndex: 30,
                    left: `calc(${petPosition.x}% - 2.5rem)`,
                    top: `calc(${petPosition.y}% - 2.5rem)`,
                    willChange: 'left, top, transform'
                  }}
                />

                {isHighFiving && (
                  <div
                    className="absolute"
                    style={{ zIndex: 55, left: `calc(${petPosition.x}% - 2.5rem)`, top: `calc(${petPosition.y}% - 2.5rem)` }}
                  >
                    <div className="relative w-20 h-20">
                      <span className="absolute inset-0 rounded-full border-4 border-yellow-400/80 animate-ping"></span>
                      <span className="absolute inset-2 rounded-full border-4 border-pink-400/80 animate-ping"></span>
                      <span className="absolute inset-4 rounded-full border-4 border-purple-400/80 animate-ping"></span>
                    </div>
                  </div>
                )}

                <div
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center w-20 h-20 rounded-full bg-slate-800/70 border border-white/10 text-white text-xl"
                  style={{ zIndex: 35 }}
                >
                  🥣
                  {isFeeding && (
                    <>
                      <span className="absolute inset-0 rounded-full border-2 border-pink-400/40 animate-ping" />
                      <span className="absolute inset-2 rounded-full border-2 border-purple-400/30 animate-ping" />
                    </>
                  )}
                </div>

                {petToast.visible && (
                  <div
                    className={`absolute px-3 py-2 rounded-xl text-white text-sm bg-black/70 backdrop-blur-sm border border-white/10 transition-all duration-300 ${petToast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
                    style={{
                      zIndex: 60,
                      left: `calc(${petPosition.x}%)`,
                      top: `calc(${petPosition.y}% - 5rem)`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    {petToast.message}
                  </div>
                )}
                
                <div 
                  className={`absolute top-4 right-4 transition-all duration-500 transform ${
                    handDetection.isHandVisible 
                      ? 'translate-y-0 opacity-100 scale-100' 
                      : '-translate-y-2 opacity-0 scale-95'
                  }`}
                  style={{ zIndex: 50 }}
                >
                  <div className="bg-green-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-xl shadow-lg border border-green-400/30">
                    <div className="flex items-center gap-2">
                      <Hand className="w-4 h-4 animate-pulse" />
                      <span className="text-sm font-medium">
                        Hand Detected! ({handDetection.handCount})
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="absolute top-4 left-4" style={{ zIndex: 48 }}>
                  <button
                    onClick={() => setShowDebug(v => !v)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-slate-200 hover:bg-slate-800/80 transition-colors"
                  >
                    <Bug className="w-4 h-4 text-pink-300" />
                    <span className="text-xs font-medium">Debug</span>
                  </button>
                  {showDebug && (
                    <div className="mt-2 bg-slate-900/80 backdrop-blur-sm rounded-xl p-3 text-xs text-slate-300 border border-white/10 max-w-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className={`${handDetection.isHandVisible ? 'bg-green-400' : 'bg-red-400'} w-2 h-2 rounded-full`}></div>
                          <span>Hand Status: {handDetection.isHandVisible ? 'Detected' : 'Not Detected'}</span>
                        </div>
                        <div>Hands Count: {handDetection.handCount}</div>
                        <div>Pet Position: ({petPosition.x.toFixed(1)}%, {petPosition.y.toFixed(1)}%)</div>
                        <div>Pinch: {gestureInfo.isPinching ? 'Yes' : 'No'}</div>
                        <div>Grabbing: {isGrabbing ? 'Yes' : 'No'}</div>
                        <div>Petting: {isPetting ? 'Yes' : 'No'}</div>
                        <div>Feeding: {isFeeding ? 'Yes' : 'No'}</div>
                        <div>Open Hand: {gestureInfo.isOpenHand ? 'Yes' : 'No'}</div>
                        <div>Fist: {gestureInfo.isFist ? 'Yes' : 'No'}</div>
                        <div>Pointing: {gestureInfo.isPointing ? 'Yes' : 'No'}</div>
                        <div>Extended: {gestureInfo.extendedFingers.join(', ') || 'None'}</div>
                        <div>Curl thumb/index/middle/ring/pinky: {gestureInfo.curlByFinger.thumb.toFixed(2)} / {gestureInfo.curlByFinger.index.toFixed(2)} / {gestureInfo.curlByFinger.middle.toFixed(2)} / {gestureInfo.curlByFinger.ring.toFixed(2)} / {gestureInfo.curlByFinger.pinky.toFixed(2)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setIsCameraOn(false)}
                  className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-xl transition-all duration-200 hover:shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                  Stop Camera
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-white/10" style={{ zIndex: 40 }}>
        <div className="flex flex-wrap items-center justify-center gap-3 text-slate-300 text-xs">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Pointer className="w-3.5 h-3.5 text-pink-300" />
            Poke the pet
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Hand className="w-3.5 h-3.5 text-purple-300" />
            High five with open hand
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Camera className="w-3.5 h-3.5 text-purple-300" />
            Pinch near pet to grab
          </span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Utensils className="w-3.5 h-3.5 text-pink-300" />
            Pinch near bowl to feed
          </span>
        </div>
      </div>
    </div>
  );
};

export default VirtualPet;
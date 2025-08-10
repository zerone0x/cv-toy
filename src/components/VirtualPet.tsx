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
  const [petImage, setPetImage] = useState<string>('https://images.pexels.com/photos/1170986/pexels-photo-1170986.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=face');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastFingerActionRef = useRef<{ [key: string]: number }>({});
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petRef = useRef<HTMLImageElement>(null);
  const petPositionRef = useRef<PetPosition>({ x: 50, y: 80 });
  const isGrabbingRef = useRef(false);
  const grabOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  useEffect(() => { petPositionRef.current = petPosition; }, [petPosition]);
  useEffect(() => { isGrabbingRef.current = isGrabbing; }, [isGrabbing]);

  const handlePetImageChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPetImage(url);
    e.target.value = '';
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

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

            if (!isGrabbingRef.current && !isPinchingNow && nearPet) {
              const singleExtended = extendedFingers.length === 1 ? extendedFingers[0] : null;
              if (singleExtended && singleExtended !== 'index') {
                const lastTime = lastFingerActionRef.current[singleExtended] || 0;
                if (currentTime - lastTime > 1000) {
                  lastFingerActionRef.current[singleExtended] = currentTime;
                  let message = '';
                  if (singleExtended === 'thumb') message = 'Thumbs up!';
                  else if (singleExtended === 'middle') message = 'Wave!';
                  else if (singleExtended === 'ring') message = 'Shiny!';
                  else if (singleExtended === 'pinky') message = 'Pinky promise!';
                  if (message) {
                    setIsPoking(true);
                    showPetToast(message);
                    if (pokingHideTimeoutRef.current) {
                      window.clearTimeout(pokingHideTimeoutRef.current);
                    }
                    pokingHideTimeoutRef.current = window.setTimeout(() => {
                      setIsPoking(false);
                    }, 350);
                  }
                }
              }
            }

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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      {/* Enhanced ambient background effects */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-r from-violet-500/30 to-purple-500/30 blur-3xl animate-pulse" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gradient-to-r from-pink-500/25 to-rose-500/25 blur-3xl animate-pulse" aria-hidden="true" style={{ animationDelay: '1s' }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 blur-3xl animate-pulse" aria-hidden="true" style={{ animationDelay: '2s' }} />
      
      <div className="relative w-full max-w-5xl">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePetImageChange} />
        {!isCameraOn ? (
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-12 text-center overflow-hidden">
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-purple-500/5 rounded-3xl" />
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.15),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(236,72,153,0.15),transparent_50%)]" />
            
            <div className="relative mb-12">
              {/* Enhanced icon with floating animation */}
              <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 mb-8 shadow-2xl shadow-purple-500/40 animate-float">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 to-transparent" />
                <Sparkles className="w-12 h-12 text-white drop-shadow-lg" />
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-violet-500 to-pink-500 opacity-75 blur-sm -z-10 animate-pulse" />
              </div>
              
              {/* Enhanced typography */}
              <h1 className="text-5xl md:text-6xl font-black text-white mb-4 bg-gradient-to-r from-violet-300 via-purple-300 to-pink-300 bg-clip-text text-transparent tracking-tight leading-tight">
                Virtual Pet
              </h1>
              <div className="h-1 w-24 bg-gradient-to-r from-violet-500 to-pink-500 rounded-full mx-auto mb-6" />
              <p className="text-slate-300 text-xl leading-relaxed max-w-2xl mx-auto font-light">
                Experience the magic of AI-powered pet interaction. Use intuitive hand gestures to play, feed, and bond with your virtual companion.
              </p>
            </div>

            {/* Enhanced feature grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto mb-12">
              <div className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:border-violet-400/30">
                <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 group-hover:from-violet-500/30 group-hover:to-purple-500/30 transition-all duration-300">
                  <Hand className="w-6 h-6 text-violet-300" />
                </div>
                <span className="text-sm font-medium">Hand Gestures</span>
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Details</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Pinch near the pet to grab and drag to move</li>
                    <li>Pinch near the bowl to feed</li>
                    <li>Open hand near the pet to pet</li>
                    <li>Open hand quickly approaching triggers “High five!”</li>
                    <li>Point with index finger near the pet to “Boop!”</li>
                  </ul>
                </div>
              </div>
              <div className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:border-pink-400/30">
                <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 group-hover:from-pink-500/30 group-hover:to-rose-500/30 transition-all duration-300">
                  <Pointer className="w-6 h-6 text-pink-300" />
                </div>
                <span className="text-sm font-medium">Interactive Poke</span>
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Details</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Point with your index finger near the pet to trigger “Boop!”</li>
                    <li>Click or tap the pet avatar to poke</li>
                  </ul>
                </div>
              </div>
              <div className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:border-purple-400/30">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 group-hover:from-purple-500/30 group-hover:to-violet-500/30 transition-all duration-300">
                  <Utensils className="w-6 h-6 text-purple-300" />
                </div>
                <span className="text-sm font-medium">Smart Feeding</span>
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Details</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Pinch near the bowl to feed your pet</li>
                    <li>Short cooldown prevents repeated triggers</li>
                  </ul>
                </div>
              </div>
              <div className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:border-rose-400/30">
                <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 group-hover:from-rose-500/30 group-hover:to-pink-500/30 transition-all duration-300">
                  <Heart className="w-6 h-6 text-rose-300" />
                </div>
                <span className="text-sm font-medium">Affection System</span>
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Details</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Open hand near the pet to pet and comfort</li>
                    <li>Open hand with fast approach triggers “High five!”</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Enhanced action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={startCamera}
                className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-500 hover:via-purple-500 hover:to-pink-500 text-white font-bold py-5 px-10 rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:ring-offset-2 focus:ring-offset-transparent"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Play className="w-7 h-7 transition-transform group-hover:scale-110 drop-shadow-sm" />
                <span className="text-lg">Start Experience</span>
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 opacity-75 blur-lg -z-10 group-hover:opacity-100 transition-opacity duration-300" />
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Camera Control</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>One-click to request camera access</li>
                    <li>Use “End Session” to stop the camera</li>
                  </ul>
                </div>
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group relative inline-flex items-center gap-3 bg-white/10 hover:bg-white/15 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 hover:scale-105 border border-white/20 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <Camera className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span>Customize Pet</span>
                <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Upload Image</div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Upload an image to customize the pet avatar</li>
                    <li>Most common image formats are supported</li>
                  </ul>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
            {/* Glassmorphism overlay for camera interface */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-purple-500/5 rounded-3xl" />
            
            <div className="relative p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2 bg-gradient-to-r from-violet-300 to-pink-300 bg-clip-text text-transparent">
                  Interactive Pet Experience
                </h2>
                <div className="h-0.5 w-16 bg-gradient-to-r from-violet-500 to-pink-500 rounded-full mx-auto" />
              </div>
              
              <div className="relative aspect-video bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-3xl overflow-hidden border border-white/20 shadow-2xl backdrop-blur-sm">
                {/* Enhanced ambient lighting */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.15),transparent_50%),radial-gradient(ellipse_at_center,rgba(59,130,246,0.08),transparent_70%)]" style={{ zIndex: 5 }} />

                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1] rounded-3xl"
                  muted
                  autoPlay
                  playsInline
                  style={{ zIndex: 10 }}
                />
                
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full scale-x-[-1] rounded-3xl"
                  style={{ zIndex: 20 }}
                />

                {/* Enhanced interaction glow effects */}
                {(isPetting || isFeeding || isPoking || isHighFiving) && (
                  <>
                    <div
                      className="absolute w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.3),rgba(168,85,247,0.25)_30%,rgba(236,72,153,0.15)_60%,transparent_80%)] blur-xl animate-pulse"
                      style={{ zIndex: 25, left: `${petPosition.x}%`, top: `${petPosition.y}%` }}
                    />
                    <div
                      className="absolute w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4),rgba(168,85,247,0.3)_40%,transparent_70%)] blur-md"
                      style={{ zIndex: 27, left: `${petPosition.x}%`, top: `${petPosition.y}%` }}
                    />
                  </>
                )}
                
                {/* Enhanced pet with better styling */}
                <img
                  ref={petRef}
                  src={petImage}
                  alt="Virtual Pet"
                  id="virtual-pet"
                  className={`absolute w-24 h-24 rounded-full object-cover border-4 border-white/80 shadow-2xl transition-all duration-300 ease-out transform hover:scale-110 cursor-pointer ${
                    (isPetting || isFeeding || isPoking) ? 'scale-110 border-violet-300/80 shadow-violet-500/50' : ''
                  } ${isGrabbing ? 'scale-105 rotate-2' : ''}`}
                  onClick={handlePetPoke}
                  onTouchStart={handlePetPoke}
                  style={{
                    zIndex: 30,
                    left: `calc(${petPosition.x}% - 3rem)`,
                    top: `calc(${petPosition.y}% - 3rem)`,
                    willChange: 'left, top, transform',
                    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.3))'
                  }}
                />

                {/* Enhanced high-five effect */}
                {isHighFiving && (
                  <div
                    className="absolute"
                    style={{ zIndex: 55, left: `calc(${petPosition.x}% - 3rem)`, top: `calc(${petPosition.y}% - 3rem)` }}
                  >
                    <div className="relative w-24 h-24">
                      <span className="absolute inset-0 rounded-full border-4 border-yellow-400/90 animate-ping"></span>
                      <span className="absolute inset-2 rounded-full border-4 border-pink-400/90 animate-ping" style={{ animationDelay: '0.1s' }}></span>
                      <span className="absolute inset-4 rounded-full border-4 border-purple-400/90 animate-ping" style={{ animationDelay: '0.2s' }}></span>
                      <span className="absolute inset-6 rounded-full border-4 border-violet-400/90 animate-ping" style={{ animationDelay: '0.3s' }}></span>
                    </div>
                  </div>
                )}

                {/* Enhanced food bowl */}
                <div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-slate-800/90 to-slate-700/90 border-2 border-white/20 text-white text-2xl shadow-2xl backdrop-blur-sm"
                  style={{ zIndex: 35 }}
                >
                  🥣
                  {isFeeding && (
                    <>
                      <span className="absolute inset-0 rounded-full border-3 border-pink-400/60 animate-ping" />
                      <span className="absolute inset-2 rounded-full border-3 border-purple-400/50 animate-ping" style={{ animationDelay: '0.2s' }} />
                      <span className="absolute inset-4 rounded-full border-3 border-violet-400/40 animate-ping" style={{ animationDelay: '0.4s' }} />
                    </>
                  )}
                </div>

                {/* Enhanced toast messages */}
                {petToast.visible && (
                  <div
                    className={`absolute px-4 py-3 rounded-2xl text-white text-sm font-medium bg-black/80 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300 ${
                      petToast.visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'
                    }`}
                    style={{
                      zIndex: 60,
                      left: `calc(${petPosition.x}%)`,
                      top: `calc(${petPosition.y}% - 6rem)`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500/20 to-pink-500/20" />
                    <span className="relative">{petToast.message}</span>
                  </div>
                )}
                
                {/* Enhanced hand detection indicator */}
                <div
                  className={`absolute top-6 right-6 transition-all duration-500 transform ${
                    handDetection.isHandVisible
                      ? 'translate-y-0 opacity-100 scale-100'
                      : '-translate-y-4 opacity-0 scale-90'
                  }`}
                  style={{ zIndex: 50 }}
                >
                  <div className="bg-gradient-to-r from-emerald-500/90 to-green-500/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400/30">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Hand className="w-5 h-5 animate-pulse" />
                        <div className="absolute inset-0 w-5 h-5 bg-emerald-300 rounded-full blur-sm animate-ping opacity-75" />
                      </div>
                      <span className="text-sm font-semibold">
                        Hand Active ({handDetection.handCount})
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced control panel */}
                <div className="absolute top-6 left-6 space-y-3" style={{ zIndex: 48 }}>
                  <button
                    onClick={() => setShowDebug(v => !v)}
                    className="group relative inline-flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/15 transition-all duration-300 hover:scale-105 shadow-lg"
                  >
                    <Bug className="w-4 h-4 text-pink-300 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium">Debug</span>
                    <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Debug Panel</div>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Inspect hand detection status</li>
                        <li>See gesture state and pet position</li>
                        <li>Helpful for troubleshooting</li>
                      </ul>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative inline-flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/15 transition-all duration-300 hover:scale-105 shadow-lg"
                  >
                    <Camera className="w-4 h-4 text-violet-300 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium">Change Pet</span>
                    <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-3 rounded-xl border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Upload Image</div>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Upload an image to customize the pet avatar</li>
                        <li>Replaces the default pet image</li>
                      </ul>
                    </div>
                  </button>
                  
                  {/* Enhanced debug panel */}
                  {showDebug && (
                    <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 text-xs text-slate-300 border border-white/20 max-w-sm shadow-2xl">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                          <div className={`${handDetection.isHandVisible ? 'bg-emerald-400' : 'bg-red-400'} w-3 h-3 rounded-full animate-pulse`}></div>
                          <span className="font-medium">Status: {handDetection.isHandVisible ? 'Connected' : 'Searching...'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Hands: {handDetection.handCount}</div>
                          <div>Position: ({petPosition.x.toFixed(1)}%, {petPosition.y.toFixed(1)}%)</div>
                          <div>Pinch: {gestureInfo.isPinching ? '✓' : '✗'}</div>
                          <div>Grab: {isGrabbing ? '✓' : '✗'}</div>
                          <div>Pet: {isPetting ? '✓' : '✗'}</div>
                          <div>Feed: {isFeeding ? '✓' : '✗'}</div>
                          <div>Open: {gestureInfo.isOpenHand ? '✓' : '✗'}</div>
                          <div>Point: {gestureInfo.isPointing ? '✓' : '✗'}</div>
                        </div>
                        <div className="pt-2 border-t border-white/10">
                          <div className="text-xs text-slate-400">Extended: {gestureInfo.extendedFingers.join(', ') || 'None'}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Enhanced stop button */}
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => setIsCameraOn(false)}
                  className="group inline-flex items-center gap-3 bg-gradient-to-r from-slate-700/80 to-slate-600/80 hover:from-slate-600/80 hover:to-slate-500/80 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 hover:scale-105 border border-white/20 hover:border-white/30 shadow-xl focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <Camera className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span>End Session</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-white/10" style={{ zIndex: 40 }}>
        <div className="flex flex-wrap items-center justify-center gap-3 text-slate-300 text-xs">
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Pointer className="w-3.5 h-3.5 text-pink-300" />
            Poke the pet
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Point with index finger near the pet to trigger “Boop!”.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Hand className="w-3.5 h-3.5 text-purple-300" />
            High five with open hand
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Open hand quickly approaching the pet triggers “High five!”.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Camera className="w-3.5 h-3.5 text-purple-300" />
            Pinch near pet to grab
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Pinch near the pet to grab and drag to move.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Utensils className="w-3.5 h-3.5 text-pink-300" />
            Pinch near bowl to feed
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Pinch near the bowl to trigger the feeding effect.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Play className="w-3.5 h-3.5 text-violet-300" />
            Start/Stop camera
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Use “Start Experience” to grant camera access and “End Session” to stop it.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-violet-300" />
            Upload image
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              Customize the pet avatar by uploading an image.
            </div>
          </span>
          <span className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10">
            <Bug className="w-3.5 h-3.5 text-pink-300" />
            Debug panel
            <div role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-64 text-left bg-black/80 text-slate-100 text-xs p-2.5 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
              View hand detection, gesture state, and position.
            </div>
          </span>
        </div>
      </div>
    </div>
  );
};

export default VirtualPet;
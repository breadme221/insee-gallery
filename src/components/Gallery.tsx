"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import JSZip from "jszip";

// S3 이미지 베이스 URL — 상대경로를 절대경로로 변환
const S3_BASE = process.env.NEXT_PUBLIC_S3_BASE || "https://insight-x-gallery.s3.ap-northeast-2.amazonaws.com";
const s3url = (path: string) => path?.startsWith("http") ? path : `${S3_BASE}/${path}`;

// 데이터 로드 함수 — S3에서 직접 JS 파일 가져와서 JSON 추출
async function loadGalleryData(): Promise<any> {
  try {
    // S3에서 직접 로드 (Vercel 보호 설정 우회)
    const res = await fetch(`${S3_BASE}/data_tagged.js`);
    const text = await res.text();
    const match = text.match(/const GALLERY_DATA\s*=\s*/);
    if (!match) return null;
    const start = match.index! + match[0].length;
    const end = text.lastIndexOf("};") + 1;
    return JSON.parse(text.slice(start, end));
  } catch (e) {
    console.error("Failed to load gallery data:", e);
    return null;
  }
}

// ==========================================
// Agentation (dev only)
// ==========================================
function AgentationWrapper() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import("agentation")
      .then((mod) => setComp(() => (mod as any).Agentation))
      .catch(() => {});
  }, []);
  if (!Comp) return null;
  return <Comp />;
}

// ==========================================
// Data loader
// ==========================================
const getDATA = () =>
  typeof window !== "undefined" && (window as any).GALLERY_DATA
    ? (window as any).GALLERY_DATA
    : { apps: [], screens: [], categories: ["All"], patterns: ["All"] };

// ==========================================
// Featured Apps (메이가 수정할 인기 앱 목록)
// ==========================================
const FEATURED_REWARD_APPS = [
  "sweatcoin", "cashwalk", "fetch", "freecash", "bitbuni", "orak", "winwalk",
  "macadam", "weward", "torima", "kurashiru-rewards", "cashwalk_jp", "슬립머니",
  "야핏무브", "cashslide",
];
const FEATURED_HEALTH_APPS = [
  "calm", "fitbit", "strava", "myfitnesspal", "headspace", "noom", "lifesum",
  "nike-run-club", "zero", "bend", "bitepal", "callie", "stresswatch",
  "wakeout", "플랜핏", "필라이즈", "트로스트",
];

// 앱 아이콘 색상 (카테고리별)
const CATEGORY_COLORS: Record<string, string> = {
  Rewards: "#f59e0b", Health: "#10b981", Finance: "#3b82f6",
  Shopping: "#ec4899", Food: "#f97316", Lifestyle: "#8b5cf6",
  Entertainment: "#06b6d4", Education: "#14b8a6", Travel: "#0ea5e9",
  Transport: "#64748b", Music: "#e11d48",
};

// ==========================================
// AI 검색 키워드 매핑 (로컬 fallback)
// ==========================================
const PATTERN_KEYWORDS: Record<string, string[]> = {
  "온보딩": ["Onboarding", "Welcome", "Sign Up"],
  "로그인": ["Login", "Sign Up"],
  "가입": ["Sign Up", "Onboarding"],
  "홈": ["Home", "Feed"],
  "채팅": ["Chat", "Messages"],
  "검색": ["Search"],
  "결제": ["Payment", "Checkout"],
  "설정": ["Settings"],
  "프로필": ["Profile", "My Account"],
  "리스트": ["List", "Feed"],
  "지도": ["Map"],
  "알림": ["Notifications"],
  "장바구니": ["Cart", "Checkout"],
  "상세": ["Product Detail", "Content Detail"],
  "모달": ["Modal", "Bottom Sheet"],
  "에러": ["Error", "Empty State"],
  "로딩": ["Loading"],
  "댓글": ["Comments"],
  "공유": ["Share"],
};

// ==========================================
// 앱 아이콘 맵 로드
// ==========================================
let _iconMap: Record<string, string> | null = null;
async function loadIconMap() {
  if (_iconMap) return _iconMap;
  try {
    const r = await fetch("/icons/icon_map.json");
    _iconMap = await r.json();
  } catch { _iconMap = {}; }
  return _iconMap!;
}

function useIconMap() {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => { loadIconMap().then(setMap); }, []);
  return map;
}

// ==========================================
// 앱 아이콘 컴포넌트 (실제 아이콘 + 폴백)
// ==========================================
function AppIcon({
  app,
  size = 52,
  onClick,
  isActive,
  iconMap,
}: {
  app: any;
  size?: number;
  onClick?: (app: any) => void;
  isActive?: boolean;
  iconMap?: Record<string, string>;
}) {
  const color = CATEGORY_COLORS[app.category] || "#6b7280";
  const initial = (app.name || "?").replace(/^(wwit_|the\s)/i, "")[0].toUpperCase();
  const iconFile = iconMap?.[app.id];

  return (
    <button
      onClick={() => onClick?.(app)}
      className={`app-icon-btn flex items-center justify-center select-none overflow-hidden ${isActive ? "active" : ""}`}
      style={{ width: size, minWidth: size, height: size, backgroundColor: iconFile ? "transparent" : color, fontSize: size * 0.38 }}
      title={app.name}
    >
      {iconFile ? (
        <img src={`/icons/${iconFile}`} alt={app.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-bold">{initial}</span>
      )}
    </button>
  );
}

// ==========================================
// Featured App Bar (무한 자동 스크롤 마키 + 드래그 + 그라데이션)
// ==========================================
const FEATURED_ALL_APPS = [...FEATURED_REWARD_APPS, ...FEATURED_HEALTH_APPS];

function FeaturedAppBar({
  onAppClick,
  activeAppId,
  DATA,
  iconMap,
}: {
  onAppClick: (app: any) => void;
  activeAppId?: string;
  DATA: any;
  iconMap: Record<string, string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const speedRef = useRef(0.5); // px per frame
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const pauseTimeout = useRef<any>(null);

  const allApps = useMemo(
    () => FEATURED_ALL_APPS.map((id) => DATA.apps.find((a: any) => a.id === id)).filter(Boolean),
    [DATA.apps]
  );

  // 무한 루프를 위해 리스트 3배로 복제
  const tripled = useMemo(() => [...allApps, ...allApps, ...allApps], [allApps]);

  // 자동 스크롤 애니메이션
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || allApps.length === 0) return;

    // 초기 위치: 중간 복제본 시작점
    const oneSetWidth = el.scrollWidth / 3;
    el.scrollLeft = oneSetWidth;

    const tick = () => {
      if (!isDragging.current) {
        el.scrollLeft += speedRef.current;
        // 무한 루프: 3번째 복제에 도달하면 1번째로 점프
        if (el.scrollLeft >= oneSetWidth * 2) {
          el.scrollLeft -= oneSetWidth;
        }
        if (el.scrollLeft <= 0) {
          el.scrollLeft += oneSetWidth;
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [allApps.length]);

  // 드래그 핸들러
  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    scrollStartX.current = scrollRef.current!.scrollLeft;
    scrollRef.current!.style.cursor = "grabbing";
    clearTimeout(pauseTimeout.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    scrollRef.current!.scrollLeft = scrollStartX.current - dx;
  };
  const onPointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    scrollRef.current!.style.cursor = "grab";
    // 드래그 끝나고 1.5초 후 자동 스크롤 재개 (이미 tick에서 처리)
  };

  if (allApps.length === 0) return null;

  return (
    <div className="border-b border-gray-200 bg-white relative">
      {/* 좌측 그라데이션 */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      {/* 우측 그라데이션 */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto hide-scrollbar py-3 px-6 cursor-grab select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {tripled.map((app: any, i: number) => (
          <AppIcon key={`${app.id}-${i}`} app={app} onClick={onAppClick} isActive={activeAppId === app.id} iconMap={iconMap} />
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 앱 카드 (홈 화면용)
// ==========================================
const CUSTOM_THUMBNAILS: Record<string, number> = {
  freecash: 5, winwalk: 3, cashwalk_us: 2, "오락": 1, "야핏무브": 5,
};

function AppCard({
  app,
  screens,
  onClick,
  iconMap,
}: {
  app: any;
  screens: any[];
  onClick: (app: any) => void;
  iconMap: Record<string, string>;
}) {
  const thumbIndex = CUSTOM_THUMBNAILS[app.id] || CUSTOM_THUMBNAILS[app.name] || 0;
  const preview = screens[thumbIndex] || screens[0];
  const color = CATEGORY_COLORS[app.category] || "#6b7280";
  const iconFile = iconMap?.[app.id];

  return (
    <div
      className="app-card relative bg-white rounded-2xl overflow-hidden cursor-pointer border border-gray-100 shadow-sm hover:shadow-lg group"
      onClick={() => onClick(app)}
    >
      {/* Phone mockup */}
      <div className="p-4 pb-0 flex justify-center">
        <div className="phone-lift w-[75%]">
          <div className="phone-frame bg-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {preview ? (
              <img src={s3url(preview.image)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="p-3 pt-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: iconFile ? "transparent" : color }}
          >
            {iconFile ? (
              <img src={`/icons/${iconFile}`} alt="" className="w-full h-full object-cover" />
            ) : null}
            {(app.name || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-gray-900 truncate">{app.name}</h3>
            <p className="text-xs text-gray-400">{screens.length} screens</p>
          </div>
        </div>
      </div>

      {/* Hover overlay with category badge */}
      <div className="card-info-slide absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: color }}>
            {app.category}
          </span>
          {app.region && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-medium">
              {app.region}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 스크린 카드
// ==========================================
function ScreenCard({
  screen,
  isSelected,
  onSelect,
  onClick,
}: {
  screen: any;
  isSelected: boolean;
  onSelect: (screen: any) => void;
  onClick: (screen: any) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = s3url(screen.image);
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      alert("이미지를 우클릭하여 복사해주세요.");
    }
  };

  return (
    <div
      className={`screen-thumb relative cursor-pointer rounded-xl overflow-hidden ${isSelected ? "selection-ring" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(screen)}
    >
      <div className="phone-frame bg-gray-100 rounded-xl overflow-hidden">
        <img
          src={s3url(screen.image)}
          alt={screen.patterns?.join(", ") || ""}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      </div>

      {/* 선택 체크 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect(screen);
        }}
        className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          isSelected
            ? "bg-accent border-accent text-white"
            : hovered
              ? "bg-black/40 border-white/80 text-white"
              : "bg-black/20 border-white/40 text-transparent"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </button>

      {/* 호버 액션 */}
      {hovered && (
        <div className="absolute bottom-2 left-2 right-2 flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(screen);
            }}
            className="flex-1 py-1.5 bg-white text-gray-900 rounded-lg font-medium text-xs hover:bg-gray-100 transition-colors shadow-sm"
          >
            Save
          </button>
          <button
            onClick={handleCopy}
            className="flex-1 py-1.5 bg-gray-800 text-white rounded-lg font-medium text-xs hover:bg-gray-700 transition-colors shadow-sm"
          >
            {copyOk ? "\u2713" : "Copy"}
          </button>
        </div>
      )}

      {/* 뱃지 */}
      {screen.changeType === "new" && (
        <span className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full">
          NEW
        </span>
      )}
      {screen.changeType === "updated" && (
        <span className="absolute top-2 right-2 px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full">
          UPDATED
        </span>
      )}

      {/* 패턴 태그 */}
      {screen.patterns?.length > 0 && !hovered && (
        <div className="absolute bottom-2 left-2 right-2">
          <span className="text-[11px] bg-black/60 text-white px-2 py-0.5 rounded-md truncate block backdrop-blur-sm">
            {screen.patterns[0]}
          </span>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 앱 상세 뷰
// ==========================================
function AppDetailView({
  app,
  screens,
  onBack,
  onScreenClick,
  selectedScreens,
  onToggleSelect,
  DATA,
}: {
  app: any;
  screens: any[];
  onBack: () => void;
  onScreenClick: (screen: any, screens: any[]) => void;
  selectedScreens: Set<string>;
  onToggleSelect: (screen: any) => void;
  DATA: any;
}) {
  const [downloading, setDownloading] = useState(false);
  const versions = app.versions || [];
  const latestVersion = versions[versions.length - 1] || null;
  const [selectedVersion, setSelectedVersion] = useState<string | null>(latestVersion);

  useEffect(() => {
    setSelectedVersion((app.versions || []).slice(-1)[0] || null);
  }, [app.id]);

  const displayScreens = useMemo(() => {
    if (!selectedVersion || selectedVersion === "all") return screens;
    return screens.filter((s: any) => s.version === selectedVersion);
  }, [screens, selectedVersion]);

  const handleDownloadAll = async () => {
    if (displayScreens.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < displayScreens.length; i++) {
        try {
          const r = await fetch(s3url(displayScreens[i].image));
          const blob = await r.blob();
          const ext = displayScreens[i].image.split(".").pop() || "png";
          zip.file(
            `${String(i + 1).padStart(3, "0")}_${displayScreens[i].patterns?.[0] || "screen"}.${ext}`,
            blob
          );
        } catch {}
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      Object.assign(document.createElement("a"), {
        href: url,
        download: `${app.name}_${displayScreens.length}screens.zip`,
      }).click();
      URL.revokeObjectURL(url);
    } catch {
      alert("다운로드 실패");
    } finally {
      setDownloading(false);
    }
  };

  const color = CATEGORY_COLORS[app.category] || "#6b7280";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: color }}
          >
            {(app.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{app.name}</h2>
              {versions.length >= 2 && (
                <select
                  value={selectedVersion || "all"}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="all">All versions</option>
                  {versions.map((v: string) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-gray-500 text-sm">
              {displayScreens.length} screens &middot; {app.category} {app.region ? `\u00b7 ${app.region}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors"
        >
          {downloading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              다운로드 중...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              전체 다운로드
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {displayScreens.map((s: any) => (
          <ScreenCard
            key={s.id}
            screen={s}
            isSelected={selectedScreens.has(s.id)}
            onSelect={() => onToggleSelect(s)}
            onClick={() => onScreenClick(s, displayScreens)}
          />
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 검색 결과 뷰
// ==========================================
function SearchResultsView({
  screens,
  onScreenClick,
  selectedScreens,
  onToggleSelect,
  DATA,
}: {
  screens: any[];
  onScreenClick: (screen: any, screens: any[]) => void;
  selectedScreens: Set<string>;
  onToggleSelect: (screen: any) => void;
  DATA: any;
}) {
  const [visibleCount, setVisibleCount] = useState(30);
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && visibleCount < screens.length)
          setVisibleCount((p) => Math.min(p + 18, screens.length));
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [visibleCount, screens.length]);

  const CATEGORY_ORDER = [
    "Rewards", "Health", "Finance", "Shopping", "Food", "Lifestyle",
    "Entertainment", "Education", "Travel", "Transport", "Music",
  ];
  const getRegionOrder = (r: string | undefined) => {
    if (!r) return 999;
    const l = r.toLowerCase();
    return l.includes("global") ? 0 : l.includes("korea") ? 1 : l.includes("japan") ? 2 : 999;
  };

  const groupedByApp = useMemo(() => {
    const g: Record<string, any[]> = {};
    screens.slice(0, visibleCount).forEach((s: any) => {
      if (!g[s.appId]) g[s.appId] = [];
      g[s.appId].push(s);
    });
    return g;
  }, [screens, visibleCount]);

  const sortedIds = useMemo(
    () =>
      Object.keys(groupedByApp).sort((a, b) => {
        const aa = DATA.apps.find((x: any) => x.id === a);
        const bb = DATA.apps.find((x: any) => x.id === b);
        if (!aa || !bb) return 0;
        const ca = CATEGORY_ORDER.indexOf(aa.category);
        const cb = CATEGORY_ORDER.indexOf(bb.category);
        const oa = ca === -1 ? 999 : ca;
        const ob = cb === -1 ? 999 : cb;
        if (oa !== ob) return oa - ob;
        const ra = getRegionOrder(aa.region);
        const rb = getRegionOrder(bb.region);
        if (ra !== rb) return ra - rb;
        return (bb.date || "0000").localeCompare(aa.date || "0000");
      }),
    [groupedByApp, DATA.apps]
  );

  return (
    <div className="space-y-8">
      {sortedIds.map((id) => {
        const app = DATA.apps.find((a: any) => a.id === id);
        if (!app) return null;
        return (
          <div key={id}>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">{app.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {groupedByApp[id].map((s: any) => (
                <ScreenCard
                  key={s.id}
                  screen={s}
                  isSelected={selectedScreens.has(s.id)}
                  onSelect={() => onToggleSelect(s)}
                  onClick={() => onScreenClick(s, screens)}
                />
              ))}
            </div>
          </div>
        );
      })}
      {visibleCount < screens.length && (
        <div ref={loaderRef} className="text-center py-8">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// ==========================================
// 선택 바 (하단 고정)
// ==========================================
function SelectionBar({
  count,
  onDownload,
  onClear,
  isDownloading,
}: {
  count: number;
  onDownload: () => void;
  onClear: () => void;
  isDownloading: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-2xl px-6 py-3 flex items-center gap-4 shadow-xl z-50">
      <span className="text-sm text-gray-500">
        <span className="font-semibold text-gray-900">{count}</span> selected
      </span>
      <div className="w-px h-6 bg-gray-200" />
      <button
        onClick={onDownload}
        disabled={isDownloading}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 rounded-lg font-medium text-sm transition-colors"
      >
        {isDownloading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </>
        )}
      </button>
      <button onClick={onClear} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ==========================================
// 모달 (좌우 네비게이션 포함)
// ==========================================
function Modal({
  screen,
  app,
  allScreens,
  onClose,
  onNavigate,
}: {
  screen: any;
  app: any;
  allScreens: any[];
  onClose: () => void;
  onNavigate: (screen: any) => void;
}) {
  if (!screen || !allScreens) return null;

  const currentIndex = allScreens.findIndex((s: any) => s.id === screen.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allScreens.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(allScreens[currentIndex - 1]);
  }, [hasPrev, currentIndex, allScreens, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(allScreens[currentIndex + 1]);
  }, [hasNext, currentIndex, allScreens, onNavigate]);

  // 키보드 네비게이션
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  return (
    <>
      {/* 배경 */}
      <div className="modal-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />

      {/* 좌우 네비게이션 버튼 */}
      {hasPrev && (
        <button
          onClick={goPrev}
          className="modal-nav fixed left-4 top-1/2 -translate-y-1/2 z-[60] w-12 h-12 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={goNext}
          className="modal-nav fixed right-4 top-1/2 -translate-y-1/2 z-[60] w-12 h-12 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 메인 콘텐츠 */}
      <div className="fixed inset-4 md:inset-8 z-[55] flex items-center justify-center pointer-events-none">
        <div
          className="modal-content bg-white rounded-2xl max-w-4xl w-full max-h-full overflow-auto flex shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 폰 프레임 */}
          <div className="flex-shrink-0 p-6 bg-gray-50 flex items-center justify-center rounded-l-2xl">
            <div className="phone-frame w-64 rounded-[2rem] overflow-hidden shadow-lg border border-gray-200">
              <img src={s3url(screen.image)} alt="" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* 상세 정보 */}
          <div className="flex-1 p-6 overflow-auto relative">
            {/* 닫기 + 카운터 */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-400 font-medium">
                {currentIndex + 1} / {allScreens.length}
              </span>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1">{app?.name}</h2>
            <p className="text-gray-400 text-sm mb-6">
              {app?.category} {app?.region ? `\u00b7 ${app.region}` : ""}
            </p>

            {screen.patterns?.length > 0 && (
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {screen.patterns.map((p: string) => (
                    <span key={p} className="px-2.5 py-1 bg-accent/10 text-accent rounded-lg text-xs font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {screen.ai_description && (
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Description</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{screen.ai_description}</p>
              </div>
            )}

            {screen.elements?.length > 0 && (
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">UI Elements</h4>
                <div className="flex flex-wrap gap-1.5">
                  {screen.elements.map((e: string) => (
                    <span key={e} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md text-xs">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {screen.section && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Section</h4>
                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
                  {screen.section}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ==========================================
// 메인 Gallery 컴포넌트
// ==========================================
export default function Gallery() {
  // Data loading — S3에서 직접 로드
  const [DATA, setDATA] = useState<any>({ apps: [], screens: [], categories: ['All'], patterns: ['All'] });
  const [loading, setLoading] = useState(true);
  const iconMap = useIconMap();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[InSee] 데이터 로딩 시작...");
    loadGalleryData()
      .then((data) => {
        console.log("[InSee] 로딩 결과:", data ? `${data.apps?.length}개 앱, ${data.screens?.length}개 스크린` : "null");
        if (data && data.apps?.length > 0) {
          setDATA(data);
        } else {
          setLoadError("데이터를 불러왔지만 앱이 없습니다. 브라우저 콘솔(F12)을 확인해주세요.");
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("[InSee] Data load failed:", e);
        setLoadError(`데이터 로딩 실패: ${e.message || "네트워크 오류"}`);
        setLoading(false);
      });
  }, []);

  // 스크린이 있는 앱만 필터
  const appsWithScreens = useMemo(() => {
    const appIdsWithScreensSet = new Set(DATA.screens.map((s: any) => s.appId));
    return DATA.apps.filter((a: any) => appIdsWithScreensSet.has(a.id));
  }, [DATA]);

  // AI 검색 함수 — /api/search 호출
  const aiSearchFn = useCallback(
    async (query: string) => {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            categories: DATA.categories?.filter((c: string) => c !== "All").join(", ") || "",
            patterns: DATA.patterns?.filter((p: string) => p !== "All").join(", ") || "",
            apps: appsWithScreens.map((a: any) => a.name).join(", "),
          }),
        });
        const parsed = await response.json();
        return {
          categories: (parsed.categories || []).filter((c: string) => DATA.categories?.includes(c)),
          patterns: (parsed.patterns || []).filter((p: string) => DATA.patterns?.includes(p)),
          apps: (parsed.apps || []).filter((a: string) =>
            appsWithScreens.some((app: any) => app.name === a)
          ),
        };
      } catch (e) {
        console.error("AI search error:", e);
      }

      // 로컬 키워드 fallback
      const q = query.toLowerCase();
      const result: { categories: string[]; patterns: string[]; apps: string[] } = {
        categories: [],
        patterns: [],
        apps: [],
      };
      appsWithScreens.forEach((app: any) => {
        if (app.name.toLowerCase().includes(q)) result.apps.push(app.name);
      });
      Object.entries(PATTERN_KEYWORDS).forEach(([ko, patterns]) => {
        if (q.includes(ko)) result.patterns.push(...patterns);
      });
      return result;
    },
    [DATA, appsWithScreens]
  );

  // ─── State ───
  const [view, setView] = useState("home");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [selectedAppsFilter, setSelectedAppsFilter] = useState<string[]>([]);
  const [selectedScreen, setSelectedScreen] = useState<any>(null);
  const [modalScreens, setModalScreens] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [selectedScreens, setSelectedScreens] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const toggleSelectScreen = (screen: any) => {
    setSelectedScreens((prev) => {
      const n = new Set(prev);
      n.has(screen.id) ? n.delete(screen.id) : n.add(screen.id);
      return n;
    });
  };

  const handleDownloadSelected = async () => {
    if (selectedScreens.size === 0) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      for (const s of DATA.screens.filter((s: any) => selectedScreens.has(s.id))) {
        try {
          const app = DATA.apps.find((a: any) => a.id === s.appId);
          const r = await fetch(s3url(s.image));
          zip.file(`${app?.name || "unknown"}_${s.id}.png`, await r.blob());
        } catch {}
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      Object.assign(document.createElement("a"), {
        href: url,
        download: `insee-screens-${selectedScreens.size}.zip`,
      }).click();
      URL.revokeObjectURL(url);
      setSelectedScreens(new Set());
    } catch {
    } finally {
      setIsDownloading(false);
    }
  };

  const screensByApp = useMemo(() => {
    const g: Record<string, any[]> = {};
    DATA.screens.forEach((s: any) => {
      if (!g[s.appId]) g[s.appId] = [];
      g[s.appId].push(s);
    });
    return g;
  }, [DATA]);

  const CATEGORY_ORDER = [
    "Rewards", "Health", "Finance", "Shopping", "Food", "Lifestyle",
    "Entertainment", "Education", "Travel", "Transport", "Music",
  ];

  const filteredApps = useMemo(() => {
    const filtered = appsWithScreens.filter((app: any) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(app.category)) return false;
      if (selectedRegion) {
        const r = app.region?.toLowerCase() || "";
        if (selectedRegion === "Korea" && !r.includes("korea")) return false;
        if (selectedRegion === "Japan" && !r.includes("japan")) return false;
        if (selectedRegion === "Global" && !r.includes("global")) return false;
      }
      return true;
    });
    return filtered.sort((a: any, b: any) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      const oa = ca === -1 ? 999 : ca;
      const ob = cb === -1 ? 999 : cb;
      if (oa !== ob) return oa - ob;
      const gr = (r: string | undefined) => {
        if (!r) return 999;
        const l = r.toLowerCase();
        return l.includes("global") ? 0 : l.includes("korea") ? 1 : l.includes("japan") ? 2 : 999;
      };
      const ra = gr(a.region);
      const rb = gr(b.region);
      if (ra !== rb) return ra - rb;
      return (b.date || "0000").localeCompare(a.date || "0000");
    });
  }, [appsWithScreens, selectedCategories, selectedRegion]);

  const filteredScreens = useMemo(
    () =>
      DATA.screens.filter((s: any) => {
        const app = DATA.apps.find((a: any) => a.id === s.appId);
        if (!app) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!app.name.toLowerCase().includes(q) && !s.section?.toLowerCase().includes(q)) return false;
        }
        if (selectedCategories.length > 0 && !selectedCategories.includes(app.category)) return false;
        if (selectedPatterns.length > 0 && !s.patterns?.some((p: string) => selectedPatterns.includes(p)))
          return false;
        if (selectedAppsFilter.length > 0 && !selectedAppsFilter.includes(app.name)) return false;
        if (selectedFlow && !s.patterns?.includes(selectedFlow)) return false;
        if (selectedElement) {
          if (!s.elements?.includes(selectedElement) && !s.patterns?.includes(selectedElement)) return false;
        }
        if (selectedRegion) {
          const r = app.region?.toLowerCase() || "";
          if (selectedRegion === "Korea" && !r.includes("korea")) return false;
          if (selectedRegion === "Japan" && !r.includes("japan")) return false;
          if (selectedRegion === "Global" && r !== "global") return false;
        }
        return true;
      }),
    [DATA, searchQuery, selectedCategories, selectedPatterns, selectedAppsFilter, selectedFlow, selectedElement, selectedRegion]
  );

  const handleAISearch = async (query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSelectedCategories([]);
    setSelectedPatterns([]);
    setSelectedAppsFilter([]);
    setSearchQuery("");

    const q = query.trim().toLowerCase();
    const keywords = q.split(/\s+/).filter((k) => k.length > 0);
    const scored = appsWithScreens
      .map((app: any) => {
        const name = app.name.toLowerCase();
        let score = 0;
        if (name.includes(q)) score += 10;
        keywords.forEach((kw) => {
          if (name.includes(kw)) score += 1;
        });
        return { name: app.name, score };
      })
      .filter((a: any) => a.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .map((a: any) => a.name);

    if (scored.length > 0) {
      setSelectedAppsFilter(scored);
    } else {
      const result = await aiSearchFn(query);
      if (result.categories.length > 0) setSelectedCategories(result.categories);
      if (result.patterns.length > 0) setSelectedPatterns(result.patterns);
      if (result.apps.length > 0) setSelectedAppsFilter(result.apps);
      if (!result.categories.length && !result.patterns.length && !result.apps.length) setSearchQuery(q);
    }
    setView("search");
    setIsSearching(false);
    window.history.pushState({ view: "search" }, "", "#search");
  };

  const clearAll = () => {
    setSelectedCategories([]);
    setSelectedPatterns([]);
    setSelectedAppsFilter([]);
    setSelectedRegion(null);
    setSelectedFlow(null);
    setSelectedElement(null);
    setSearchQuery("");
    setAiSearchQuery("");
    setView("home");
    setSelectedApp(null);
    window.history.pushState({ view: "home" }, "", window.location.pathname);
  };

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const st = e.state;
      if (st?.view === "app" && st?.appId) {
        const app = DATA.apps.find((a: any) => a.id === st.appId);
        if (app) {
          setSelectedApp(app);
          setView("app");
        } else {
          setView("home");
          setSelectedApp(null);
        }
      } else if (st?.view === "search") {
        setView("search");
      } else {
        setView("home");
        setSelectedApp(null);
        setSelectedCategories([]);
        setSelectedPatterns([]);
        setSelectedAppsFilter([]);
        setSelectedRegion(null);
        setSelectedFlow(null);
        setSelectedElement(null);
        setSearchQuery("");
        setAiSearchQuery("");
      }
      setSelectedScreen(null);
    };
    window.addEventListener("popstate", handler);
    if (!window.history.state) window.history.replaceState({ view: "home" }, "");
    return () => window.removeEventListener("popstate", handler);
  }, [DATA]);

  const handleAppClick = (app: any) => {
    setSelectedApp(app);
    setView("app");
    window.history.pushState({ view: "app", appId: app.id }, "", `#app=${app.id}`);
  };

  const handleScreenClick = (screen: any, screens: any[]) => {
    setSelectedScreen(screen);
    setModalScreens(screens || []);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || (e.nativeEvent as any).keyCode === 229) return;
    if (e.key === "Enter" && aiSearchQuery.trim()) handleAISearch(aiSearchQuery);
  };

  const hasFilters =
    selectedCategories.length > 0 || selectedPatterns.length > 0 || selectedAppsFilter.length > 0 || searchQuery;

  // ─── Select 스타일 ───
  const selectCls =
    "px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-accent cursor-pointer hover:border-gray-300 transition-colors";

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">Loading gallery data...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-500 text-lg font-semibold mb-2">로딩 실패</p>
          <p className="text-gray-500 text-sm mb-4">{loadError}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm">새로고침</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-200 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1
              className="text-xl font-bold cursor-pointer hover:text-accent transition-colors tracking-tight"
              onClick={clearAll}
            >
              InSee
            </h1>

            <div className="flex-1 max-w-xl">
              <div className="relative">
                <input
                  type="text"
                  value={aiSearchQuery}
                  onChange={(e) => setAiSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="AI 검색 (예: 결제 화면, 토스 온보딩)"
                  className="w-full px-4 py-2.5 pl-10 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-accent focus:bg-white text-sm transition-all"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {hasFilters && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedCategories.map((c) => (
                <span key={c} className="px-2 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-medium">
                  {c}
                </span>
              ))}
              {selectedPatterns.map((p) => (
                <span key={p} className="px-2 py-1 bg-accent/10 text-accent rounded-full text-xs font-medium">
                  {p}
                </span>
              ))}
              {selectedAppsFilter.map((a) => (
                <span key={a} className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-medium">
                  {a}
                </span>
              ))}
              <span className="px-2 py-1 text-gray-400 text-xs">{filteredScreens.length} results</span>
            </div>
          )}
        </div>
      </header>

      {/* Featured App Bar */}
      {view === "home" && !selectedFlow && !selectedElement && !hasFilters && (
        <FeaturedAppBar onAppClick={handleAppClick} activeAppId={selectedApp?.id} DATA={DATA} iconMap={iconMap} />
      )}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {/* 필터 */}
        {(view === "home" || view === "search") && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <select
              value={selectedCategories[0] || ""}
              onChange={(e) => setSelectedCategories(e.target.value ? [e.target.value] : [])}
              className={selectCls}
            >
              <option value="">카테고리</option>
              {["Rewards", "Health", "Finance", "Shopping", "Food", "Lifestyle", "Entertainment", "Education", "Travel", "Transport", "Music"].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                )
              )}
            </select>

            <select
              value={selectedRegion || ""}
              onChange={(e) => setSelectedRegion(e.target.value || null)}
              className={selectCls}
            >
              <option value="">지역</option>
              <option value="Korea">Korea</option>
              <option value="Japan">Japan</option>
              <option value="Global">Global</option>
            </select>

            <select
              value={selectedFlow || ""}
              onChange={(e) => {
                setSelectedFlow(e.target.value || null);
                if (e.target.value) setView("search");
              }}
              className={selectCls}
            >
              <option value="">Flows</option>
              {[
                "Onboarding", "Sign Up", "Login", "Home", "Search", "Profile", "Settings", "Payment",
                "Checkout", "Cart", "Notifications", "Chat", "Rewards", "Dashboard", "Subscription",
                "Paywall", "List", "Form", "Feed", "Gamification",
              ].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <select
              value={selectedElement || ""}
              onChange={(e) => {
                setSelectedElement(e.target.value || null);
                if (e.target.value) setView("search");
              }}
              className={selectCls}
            >
              <option value="">UI Elements</option>
              {[
                "Bottom Navigation", "Tab Bar", "Card", "Modal", "Bottom Sheet", "Carousel", "Button",
                "Search Bar", "Floating Button", "Avatar", "Badge", "Chip", "Progress Bar", "Toggle", "Dropdown",
              ].map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>

            {(selectedCategories.length > 0 || selectedRegion || selectedFlow || selectedElement) && (
              <button
                onClick={() => {
                  setSelectedCategories([]);
                  setSelectedRegion(null);
                  setSelectedFlow(null);
                  setSelectedElement(null);
                  setView("home");
                }}
                className="px-3 py-2 text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
              >
                초기화
              </button>
            )}

            <span className="text-sm text-gray-400 ml-auto">
              {selectedFlow || selectedElement
                ? `${filteredScreens.length}개 스크린`
                : `${filteredApps.length}개 앱 \u00b7 ${DATA.screens.length.toLocaleString()}개 스크린`}
            </span>
          </div>
        )}

        {/* Home: 앱 그리드 */}
        {view === "home" && !selectedFlow && !selectedElement && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredApps.map((app: any) => (
                <AppCard key={app.id} app={app} screens={screensByApp[app.id] || []} onClick={handleAppClick} iconMap={iconMap} />
              ))}
            </div>
            {filteredApps.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-400">필터와 일치하는 앱이 없습니다</p>
              </div>
            )}
          </div>
        )}

        {/* App Detail */}
        {view === "app" && selectedApp && (
          <AppDetailView
            app={selectedApp}
            screens={screensByApp[selectedApp.id] || []}
            onBack={() => window.history.back()}
            onScreenClick={handleScreenClick}
            selectedScreens={selectedScreens}
            onToggleSelect={toggleSelectScreen}
            DATA={DATA}
          />
        )}

        {/* Search / Filter Results */}
        {(view === "search" || selectedFlow || selectedElement) &&
          view !== "app" &&
          (filteredScreens.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg mb-4">검색 결과가 없습니다</p>
              <button onClick={clearAll} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                필터 초기화
              </button>
            </div>
          ) : (
            <SearchResultsView
              screens={filteredScreens}
              onScreenClick={handleScreenClick}
              selectedScreens={selectedScreens}
              onToggleSelect={toggleSelectScreen}
              DATA={DATA}
            />
          ))}
      </main>

      <SelectionBar
        count={selectedScreens.size}
        onDownload={handleDownloadSelected}
        onClear={() => setSelectedScreens(new Set())}
        isDownloading={isDownloading}
      />

      <Modal
        screen={selectedScreen}
        app={selectedScreen ? DATA.apps.find((a: any) => a.id === selectedScreen.appId) : null}
        allScreens={modalScreens}
        onClose={() => setSelectedScreen(null)}
        onNavigate={(s: any) => setSelectedScreen(s)}
      />

      {process.env.NODE_ENV === "development" && <AgentationWrapper />}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";

// Gallery는 window.GALLERY_DATA를 사용하므로 SSR 비활성화
const Gallery = dynamic(() => import("@/components/Gallery"), { ssr: false });

export default function Home() {
  return <Gallery />;
}

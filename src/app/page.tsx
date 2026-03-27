"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [Gallery, setGallery] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("@/components/Gallery").then((mod) => {
      setGallery(() => mod.default);
    });
  }, []);

  if (!Gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return <Gallery />;
}

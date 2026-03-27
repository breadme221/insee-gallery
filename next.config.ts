import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // S3 이미지 18,000장 — 최적화 없이 원본 사용
    remotePatterns: [
      {
        protocol: "https",
        hostname: "insight-x-gallery.s3.ap-northeast-2.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;

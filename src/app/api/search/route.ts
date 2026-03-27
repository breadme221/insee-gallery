import { NextRequest, NextResponse } from "next/server";

// API 키가 서버에서만 사용됨 — 클라이언트에 노출 안 됨
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AI_MODEL = "google/gemini-2.0-flash-001";

export async function POST(req: NextRequest) {
  try {
    const { query, categories, patterns, apps } = await req.json();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": req.headers.get("referer") || "",
          "X-Title": "InSee Gallery",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            {
              role: "user",
              content: `Extract search filters from: "${query}"

Korean to English mapping:
- 채팅/메시지 → Chat, Messages
- 온보딩/가입 → Onboarding, Sign Up
- 로그인 → Login
- 홈 → Home, Feed
- 검색 → Search
- 결제/송금 → Payment
- 설정 → Settings
- 프로필 → Profile
- 금융/핀테크 → Payment, Checkout
- 쇼핑/이커머스 → Cart, Product Detail

IMPORTANT: Only select apps if the user EXPLICITLY mentions an app name.
If the query is about a pattern/screen type, DO NOT include any apps.

ONLY use values from these exact lists:
- categories: ${categories}
- patterns: ${patterns}
- apps (ONLY if explicitly mentioned): ${apps}

Return ONLY valid JSON:
{"categories": [], "patterns": [], "apps": []}`,
            },
          ],
          temperature: 0,
        }),
      }
    );

    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("AI search error:", e);
    return NextResponse.json(
      { categories: [], patterns: [], apps: [] },
      { status: 500 }
    );
  }
}

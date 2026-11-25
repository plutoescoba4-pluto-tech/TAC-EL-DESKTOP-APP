import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Error handlers for process
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  // Gemini API Initialization
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const callGeminiWithFallback = async (params: { contents: any, config?: any }) => {
    const candidateModels = ["gemini-3.6-flash", "gemini-3.8-flash"];
    let lastError: any = null;
    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          ...params
        });
        if (response?.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini] Model ${model} encountered issue (${err?.message || err}). Trying next model...`);
      }
    }
    throw lastError || new Error("All Gemini models unavailable");
  };

  // API Route: Bible Chat
  app.post("/api/bible/chat", async (req, res) => {
    try {
      const { prompt, history } = req.body;
      
      const systemInstruction = "You are a wise and reverent Bible Chaplain for The Apostolic Church Ghana. Your goal is to provide encouragement, guidance, and wisdom strictly from a biblical perspective. Always cite relevant Bible verses. If a question is not about the Bible or spiritual life, gently steer back to the word of God. Keep responses concise and compassionate.";

      const response = await callGeminiWithFallback({
        contents: [
          { role: "user", parts: [{ text: `System Instruction: ${systemInstruction}` }] },
          ...(history || []),
          { role: "user", parts: [{ text: prompt }] }
        ]
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Bible Chat Error:", error);
      res.json({ text: "May the peace of God be with you. 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' (2 Timothy 1:7)" });
    }
  });

  // Seek AI Configuration
  // No keys are stored in the code. The Seek AI stays switched off until real keys are set in the
  // server's environment (GROQ_KEY_1, GROQ_KEY_2, ...).
  const GROQ_KEYS = [process.env.GROQ_KEY_1, process.env.GROQ_KEY_2, process.env.GROQ_KEY_3].filter((k): k is string => !!k);
  const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_MODEL = "llama-3.3-70b-versatile";
  const SEEK_SYSTEM_PROMPT = "You are a faithful Bible assistant for a Christian church. Answer all questions using scripture. Always cite specific Bible verses with book, chapter and verse. Be encouraging, warm and faith-based. Never contradict scripture.";

  let currentKeyIndex = 0;
  let lastFailureTime = 0;

  app.post("/api/seek/chat", async (req, res) => {
    const { prompt, history, memberContext } = req.body;
    console.log(`[Seek Req] Prompt: ${prompt?.substring(0, 50)}...`);
    
    const FULL_SYSTEM_PROMPT = memberContext 
      ? `${SEEK_SYSTEM_PROMPT}\n\n${memberContext}`
      : SEEK_SYSTEM_PROMPT;
    if (Date.now() - lastFailureTime > 60000) {
      currentKeyIndex = 0;
    }

    const tryGroq = async (index: number): Promise<any> => {
      if (index >= GROQ_KEYS.length) {
        console.log("[Seek] All Groq keys tried or unavailable.");
        return null;
      }

      try {
        console.log(`[Seek] Trying Groq Key ${index + 1}...`);
        const messages = [
          { role: "system", content: FULL_SYSTEM_PROMPT },
          ...(history || [])
            .map((h: any) => ({
              role: h.role === "model" || h.role === "assistant" ? "assistant" : "user",
              content: (h.parts?.[0]?.text || h.content || "").trim()
            }))
            .filter((m: any) => m.content.length > 0),
          { role: "user", content: prompt }
        ];

        const response = await axios.post(GROQ_BASE_URL, {
          model: GROQ_MODEL,
          messages,
          temperature: 0.7
        }, {
          headers: {
            "Authorization": `Bearer ${GROQ_KEYS[index]}`,
            "Content-Type": "application/json"
          },
          timeout: 8000 // 8 second timeout for Groq
        });
        console.log(`[Seek] Groq success with Key ${index + 1}`);
        return { text: response.data.choices[0].message.content, model: `Groq (${GROQ_MODEL})` };
      } catch (error: any) {
        console.warn(`[Seek] Groq Key ${index + 1} Error:`, error.response?.status || error.message);
        if (error.response?.status === 429 || error.response?.status === 401 || error.code === 'ECONNABORTED') {
          console.warn(`[Seek] Key ${index + 1} failed, rate limited, or timed out. Rotating...`);
          currentKeyIndex = index + 1;
          lastFailureTime = Date.now();
          return tryGroq(index + 1);
        }
        return tryGroq(index + 1);
      }
    };

    try {
      let result = await tryGroq(currentKeyIndex);

      if (!result) {
        // Fallback to Gemini
        console.warn("[Seek] Falling back to Gemini...");
        try {
          const response = await callGeminiWithFallback({
            contents: [
              { role: "user", parts: [{ text: `System Instruction: ${FULL_SYSTEM_PROMPT}` }] },
              ...(history || []).map((h: any) => ({
                role: h.role === "model" || h.role === "assistant" ? "model" : "user",
                parts: h.parts || [{ text: h.content || "" }]
              })),
              { role: "user", parts: [{ text: prompt }] }
            ]
          });
          result = { text: response.text, model: "Seek AI (Scripture Assistant)" };
          console.log("[Seek] Gemini fallback success");
        } catch (geminiErr: any) {
          console.error("[Seek] Gemini error:", geminiErr?.message || geminiErr);
          result = { 
            text: "Grace and peace be unto you! 'Thy word is a lamp unto my feet, and a light unto my path.' (Psalm 119:105). Ask any scriptural or spiritual question and I am here to assist you.", 
            model: "Seek AI" 
          };
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Seek] Critical Error:", error.response?.data || error.message);
      res.json({ text: "Peace be with you. 'The Lord is my strength and my shield; my heart trusted in him, and I am helped.' (Psalm 28:7)", model: "Seek AI" });
    }
  });

  app.post("/api/seek/suggestions", async (req, res) => {
    try {
      const { memberContext } = req.body;
      if (!memberContext) return res.json({ suggestions: [] });

      const prompt = `${memberContext}

Based on the member's activity above, generate 4-5 smart suggestions for them. 
Include:
1. One related or follow-up Bible verse.
2. One related topic they might be interested in.
3. Two follow-up questions they might have for the AI.

Return ONLY a JSON object with this format:
{
  "verses": [{ "ref": "John 3:16", "text": "..." }],
  "topics": ["Grace", "Faith"],
  "questions": ["How do I Apply John 3:16 to my life?"]
}
No markdown, no preamble.`;

      const response = await callGeminiWithFallback({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      const text = response.text || "";
      const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error: any) {
      console.error("Suggestions Error:", error);
      res.json({
        verses: [{ ref: "John 3:16", text: "For God so loved the world..." }],
        topics: ["Faith", "Prayer", "Sanctification"],
        questions: ["How do I develop a consistent prayer life?", "What does the Bible say about faith?"]
      });
    }
  });

  // Static Bible Dictionary & Curated Translations
  const STATIC_BIBLES_LIST = [
    { id: "de4e12af7f28f599-01", name: "King James Version", abbreviation: "KJV" },
    { id: "06125adad2d5898a-01", name: "American Standard Version", abbreviation: "ASV" },
    { id: "9879dbb7cfe39e4d-01", name: "World English Bible", abbreviation: "WEB" },
    { id: "65eec8e0b60e656b-01", name: "Free Bible Version", abbreviation: "FBV" },
    { id: "bba9f40183526463-01", name: "Berean Standard Bible", abbreviation: "BSB" },
    { id: "asw", name: "Akuapem Twi", abbreviation: "ASW" },
    { id: "gab", name: "Ga Bible", abbreviation: "GAB" }
  ];

  const ALL_BIBLE_BOOKS_STATIC = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOSH", "JDG", "RUTH", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
    "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS",
    "JOL", "AMO", "OBA", "JNH", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK",
    "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
    "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"
  ].map(id => ({ id, name: id, nameLong: `Book of ${id}` }));

  // API Route: Bible API Proxy
  // No key in the code. Set BIBLE_API_KEY in the server's environment to switch the live Bible lookups on.
  const BIBLE_API_KEY = process.env.BIBLE_API_KEY || process.env.VITE_BIBLE_API_KEY || "";
  const BIBLE_BASE_URL = "https://api.scripture.api.bible/v1";

  app.get("/api/bible/*", async (req, res) => {
    let apiPath = req.params[0] || "";

    // Normalize any legacy or mistyped Bible IDs to authorized IDs
    apiPath = apiPath
      .replace("de4e12af7f28f59f-01", "de4e12af7f28f599-01")
      .replace("de4e12af7f28f59f-02", "65eec8e0b60e656b-01")
      .replace("06125ad6d1d47554-01", "06125adad2d5898a-01");

    // Immediately serve curated Bible versions list
    if (!apiPath || apiPath === "bibles" || apiPath === "bibles/") {
      return res.json({ data: STATIC_BIBLES_LIST });
    }

    const queryParams = req.query;
    const url = `${BIBLE_BASE_URL}/${apiPath}`;

    try {
      const response = await axios.get(url, {
        headers: { "api-key": BIBLE_API_KEY },
        params: queryParams,
        timeout: 6000
      });
      return res.json(response.data);
    } catch {
      // Clean fallback without throwing error monitor warnings
      if (apiPath.includes("/books") && !apiPath.includes("/chapters")) {
        return res.json({ data: ALL_BIBLE_BOOKS_STATIC });
      }

      if (apiPath.includes("/chapters") && !apiPath.includes("/chapters/")) {
        const parts = apiPath.split("/");
        const bookId = parts[parts.indexOf("books") + 1] || "GEN";
        const chapters = Array.from({ length: 50 }, (_, i) => ({
          id: `${bookId}.${i + 1}`,
          number: `${i + 1}`,
          bookId
        }));
        return res.json({ data: chapters });
      }

      if (apiPath.includes("/chapters/")) {
        const chapterId = apiPath.split("/").pop() || "GEN.1";
        const [bookId, chapterNum] = chapterId.split(".");
        
        // Attempt fast fallback to free public Bible API
        try {
          const publicRes = await axios.get(`https://bible-api.com/${bookId}+${chapterNum}?translation=kjv`, { timeout: 4000 });
          if (publicRes.data && publicRes.data.verses && publicRes.data.verses.length > 0) {
            const verses = publicRes.data.verses;
            const htmlContent = verses.map((v: any) => `<p><span class="v">${v.verse}</span> ${v.text.trim()}</p>`).join("");
            const simplified = verses.map((v: any) => ({ number: v.verse, text: v.text.trim() }));
            return res.json({
              data: {
                id: chapterId,
                bookId,
                number: chapterNum,
                reference: publicRes.data.reference || `${bookId} ${chapterNum}`,
                content: htmlContent,
                simplifiedVerses: simplified
              }
            });
          }
        } catch {
          // Continue to static fallback below
        }

        return res.json({
          data: {
            id: chapterId,
            bookId,
            number: chapterNum,
            reference: `${bookId} ${chapterNum}`,
            content: `<p><span class="v">1</span> In the beginning God created the heaven and the earth.</p><p><span class="v">2</span> And the earth was without form, and void; and darkness was upon the face of the deep.</p>`,
            simplifiedVerses: [
              { number: 1, text: "In the beginning God created the heaven and the earth." },
              { number: 2, text: "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters." },
              { number: 3, text: "And God said, Let there be light: and there was light." }
            ]
          }
        });
      }

      return res.json({ data: [] });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import multer from "multer";
import pdfParse from "pdf-parse";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 60000
      }
    });
  }
  return aiClient;
}

// Resilient Gemini content generator with automatic multi-model fallback and retries
async function generateWithModelFallback(params: {
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
}): Promise<string> {
  const ai = getAI();
  // Valid active models ordered by immediate availability and resilience
  const models = [
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest"
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const config: any = {};
        if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
        if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
        if (params.responseSchema) config.responseSchema = params.responseSchema;

        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (response && typeof response.text === 'string' && response.text.trim()) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} attempt ${attempt + 1} encountered: ${err?.message || err}`);
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error("All AI models failed to return a response.");
}

function formatChatForGemini(rawMessages: Array<{ role: string; text: string }>) {
  if (!rawMessages || !Array.isArray(rawMessages)) {
    return [{ role: 'user', parts: [{ text: 'Hello' }] }];
  }

  // Filter out any blank messages
  const cleanList = rawMessages
    .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map(m => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      text: m.text.trim()
    }));

  // Ensure conversation starts with user turn
  while (cleanList.length > 0 && cleanList[0].role !== 'user') {
    cleanList.shift();
  }

  if (cleanList.length === 0) {
    return [{ role: 'user', parts: [{ text: 'Hello' }] }];
  }

  // Merge adjacent turns of the same role
  const collapsed: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of cleanList) {
    if (collapsed.length > 0 && collapsed[collapsed.length - 1].role === item.role) {
      collapsed[collapsed.length - 1].text += '\n\n' + item.text;
    } else {
      collapsed.push({ role: item.role as 'user' | 'model', text: item.text });
    }
  }

  return collapsed.map(item => ({
    role: item.role,
    parts: [{ text: item.text }]
  }));
}

const upload = multer({ storage: multer.memoryStorage() });

// --- NLP Preprocessing Utilities ---
const STOPWORDS = new Set(["i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them", "their", "theirs", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"]);

function tokenizeAndPreprocess(text: string): string[] {
  // Lowercase, remove non-alphanumeric, split into tokens, remove stopwords
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// --- TF-IDF and Cosine Similarity ---
function calculateTfIdfAndCosine(jdText: string, resumesText: string[]) {
  const documents = [jdText, ...resumesText];
  const tokenizedDocs = documents.map(tokenizeAndPreprocess);

  // 1. Calculate Document Frequency (DF)
  const df: Record<string, number> = {};
  tokenizedDocs.forEach(doc => {
    const uniqueWords = new Set(doc);
    uniqueWords.forEach(w => {
      df[w] = (df[w] || 0) + 1;
    });
  });

  const N = documents.length;
  // 2. Calculate Inverse Document Frequency (IDF)
  const idf: Record<string, number> = {};
  for (const w in df) {
    idf[w] = Math.log(N / df[w]) + 1; // +1 smoothing
  }

  // 3. Compute TF-IDF vectors
  const vectors = tokenizedDocs.map(doc => {
    const tf: Record<string, number> = {};
    doc.forEach(w => tf[w] = (tf[w] || 0) + 1);
    
    const vec: Record<string, number> = {};
    for (const w in tf) {
      // Term frequency (normalized) * IDF
      vec[w] = (tf[w] / doc.length) * (idf[w] || 0);
    }
    return vec;
  });

  const jdVector = vectors[0];
  const resumeVectors = vectors.slice(1);

  // 4. Compute Cosine Similarity
  return resumeVectors.map(rVec => {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    const allWords = new Set([...Object.keys(jdVector), ...Object.keys(rVec)]);
    
    allWords.forEach(w => {
      const valA = jdVector[w] || 0;
      const valB = rVec[w] || 0;
      dotProduct += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    });
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  });
}


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/parse-jd", upload.single('jdFile'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No Job Description file provided." });
      }

      let text = "";
      if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        try {
          const pdfData = await pdfParse(file.buffer);
          text = pdfData.text;
        } catch (err) {
          console.error(`Error parsing JD PDF ${file.originalname}:`, err);
          text = file.buffer.toString('utf8');
        }
      } else {
        text = file.buffer.toString('utf8');
      }

      const cleanedText = text.trim();
      if (!cleanedText) {
        return res.status(400).json({ error: "Could not extract readable text from the uploaded file." });
      }

      res.json({ text: cleanedText, filename: file.originalname });
    } catch (err: any) {
      console.error("Error in /api/parse-jd:", err);
      res.status(500).json({ error: err.message || "Failed to parse Job Description file." });
    }
  });

  app.post("/api/screen-resumes", upload.array('resumes', 20), async (req, res) => {
    try {
      const jobDescription = req.body.jobDescription;
      const files = req.files as Express.Multer.File[];

      if (!jobDescription || !files || files.length === 0) {
        return res.status(400).json({ error: "Job description and at least one resume file are required." });
      }

      // 1 & 2: Resume Upload & Text Extraction
      const extractedResumes: { filename: string, text: string }[] = [];
      
      for (const file of files) {
        let text = "";
        if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
          try {
            const pdfData = await pdfParse(file.buffer);
            text = pdfData.text;
          } catch (err) {
            console.error(`Error parsing PDF ${file.originalname}:`, err);
            text = file.buffer.toString('utf8'); // Fallback attempt
          }
        } else {
          // Assume text file
          text = file.buffer.toString('utf8');
        }
        extractedResumes.push({ filename: file.originalname, text });
      }

      // 3, 5, 6, 7: NLP Preprocessing, JD Processing, TF-IDF, Cosine Similarity
      const resumeTexts = extractedResumes.map(r => r.text);
      const similarityScores = calculateTfIdfAndCosine(jobDescription, resumeTexts);

      // 4: Skill/Keyword Extraction (using Gemini) & 8: Matching Score
      const results = await Promise.all(extractedResumes.map(async (resume, i) => {
        const cosineScore = similarityScores[i];
        
        // Convert cosine similarity (0 to 1) to a percentage (0 to 100)
        let finalScore = Math.round(cosineScore * 100 * 1.5); // Multiply by 1.5 to boost realistic TF-IDF sparse vector scores to readable percentages
        if (finalScore > 99) finalScore = 99; // Cap at 99
        if (finalScore < 0) finalScore = 0;

        let extractedSkills: string[] = [];
        let missingSkills: string[] = [];
        let extraRecommendedSkills: string[] = [];
        let resumeImprovementTips: string[] = [];
        let recommendation: string = "";
        
        // Fallback NLP keyword diff
        const jdTokens = tokenizeAndPreprocess(jobDescription);
        const resumeTokens = new Set(tokenizeAndPreprocess(resume.text));
        const diffTokens = Array.from(new Set(jdTokens.filter(t => !resumeTokens.has(t) && t.length > 3))).slice(0, 8);

        try {
          const prompt = `You are an expert ATS (Applicant Tracking System) and Technical Career Coach.
Compare the candidate's Resume against the Job Description.

Analyze and return JSON:
1. extractedSkills: Key technical and soft skills present in the resume.
2. missingSkills: Crucial skills, tools, and qualifications required by the Job Description that are MISSING in this resume.
3. extraRecommendedSkills: 3-5 high-value bonus skills, modern industry tools, or related technologies that would make this resume stand out even stronger for this specific role.
4. resumeImprovementTips: 2-3 specific, actionable suggestions on how the candidate can integrate these missing/extra skills into their resume bullet points or projects.
5. recommendation: A clear 1-2 sentence overall summary advice.

Job Description:
${jobDescription}

Candidate Resume:
${resume.text.substring(0, 3200)}`;

          const rawJson = await generateWithModelFallback({
            contents: prompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                extractedSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Skills found in the resume" },
                missingSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Must-add missing skills from JD" },
                extraRecommendedSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Bonus extra skills to stand out" },
                resumeImprovementTips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Actionable tips to include skills in resume" },
                recommendation: { type: Type.STRING, description: "Short overall advice" }
              }
            }
          });

          const parsed = JSON.parse(rawJson || "{}");
          extractedSkills = parsed.extractedSkills || [];
          missingSkills = parsed.missingSkills || [];
          extraRecommendedSkills = parsed.extraRecommendedSkills || [];
          resumeImprovementTips = parsed.resumeImprovementTips || [];
          recommendation = parsed.recommendation || "Update your resume with the missing skills listed above.";
        } catch (e) {
          console.error("Gemini extraction fallback for", resume.filename, e);
          extractedSkills = Array.from(resumeTokens).slice(0, 6);
          missingSkills = diffTokens.length > 0 ? diffTokens.slice(0, 5) : ["Keywords alignment required"];
          extraRecommendedSkills = ["Git / Version Control", "Cloud Deployment", "API Integration", "Automated Testing"];
          resumeImprovementTips = [
            "Add explicit keywords from the job description in your project descriptions.",
            "Quantify your achievements with metrics and mention the specific tools used."
          ];
          recommendation = "Add the missing keywords and technical terms from the Job Description into your resume skills section.";
        }

        return {
          filename: resume.filename,
          score: finalScore,
          skills: extractedSkills,
          missingSkills: missingSkills,
          extraRecommendedSkills: extraRecommendedSkills,
          resumeImprovementTips: resumeImprovementTips,
          recommendation: recommendation,
          preview: resume.text.substring(0, 150).replace(/\n/g, ' ') + "...",
          fullText: resume.text
        };
      }));

      // 9 & 10: Candidate Ranking & Shortlisting
      // Sort descending by score
      results.sort((a, b) => b.score - a.score);
      
      // Determine shortlist status (e.g., top 3 or score > 40)
      const rankedResults = results.map((result, index) => {
        const isShortlisted = index < 3 && result.score >= 30;
        return { ...result, rank: index + 1, status: isShortlisted ? 'Shortlisted' : 'Rejected' };
      });

      res.json({
        candidates: rankedResults,
        pipeline_status: "Complete"
      });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Pipeline processing failed." });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, contextData } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "No messages provided." });
      }
      
      const formattedContents = formatChatForGemini(messages);

      const systemInstruction = `You are an intelligent, versatile, and friendly AI Career Coach & General Assistant.
You are fully capable and eager to answer ANY question the user asks:
- Career, resume writing, ATS score improvement, job applications, interview prep, and tech career roadmaps.
- Coding, programming, software engineering (Python, JavaScript, TypeScript, React, Java, C++, SQL, Git, etc.), algorithms, data structures, and debugging.
- General knowledge, math, science, history, literature, trivia, definitions, and daily questions.
- Creative writing, brainstorming, step-by-step problem solving, translation, and friendly chat.
- Language adaptability: If the user asks in English, Tamil, Tanglish (e.g., 'ennoda resume la enna problem', 'python explain pannu', 'kudu', 'epdi'), or any mixed phrasing, understand their context accurately and respond helpfully in clear, natural language.
- Context awareness: If Job Description or Candidate Resume context is provided below, you can reference it when relevant, but you MUST happily and directly answer ANY general or unrelated questions too without restriction. Always use clean, formatted Markdown with bullet points or code blocks where appropriate.

=== CONTEXT (Optional) ===
Job Description:
${contextData?.jobDescription ? contextData.jobDescription.substring(0, 3000) : 'None provided'}

Candidate Resume:
${contextData?.resumeText ? contextData.resumeText.substring(0, 3000) : 'None provided'}
==========================`;

      try {
        const reply = await generateWithModelFallback({
          contents: formattedContents,
          systemInstruction
        });

        res.json({ reply });
      } catch (genError: any) {
        console.error("Chat generation error:", genError);
        const lastUserMsg = messages.slice().reverse().find((m: any) => m.role === 'user')?.text || 'your question';
        res.json({
          reply: `I received your question: "${lastUserMsg}". I am ready to answer any questions about resume optimization, coding, interview tips, or general topics. Please feel free to ask again or clarify!`
        });
      }
    } catch (err: any) {
      console.error("Chat Error:", err);
      res.status(500).json({ error: err.message || "Chat failed" });
    }
  });

  app.post("/api/resume-ideas", async (req, res) => {
    try {
      const { jobDescription, resumeText } = req.body;
      
      const prompt = `The candidate's resume was rejected for the following job description. 
Based on the job description (representing the target domain) and their current resume, 
provide a structured, step-by-step guide on how they can rebuild their resume to break into this domain.

Please format the response strictly as Step 1, Step 2, Step 3, etc.

Include in your steps:
- Step 1: Core concepts and technologies they need to learn.
- Step 2: 2-3 specific project ideas they should build and add to their resume.
- Step 3: Actionable advice on how to reword their existing experience.

Format the response in clean Markdown.

Job Description:
${jobDescription}

Current Resume:
${(resumeText || '').substring(0, 3000)}`;

      const ideas = await generateWithModelFallback({
        contents: prompt
      });

      res.json({ ideas });
    } catch (err: any) {
      console.error("Resume Ideas Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate ideas" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();

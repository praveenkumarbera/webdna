import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Tokenize and clean helper
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter out short stop-words
}

// Simple in-memory TF-IDF RAG pipeline (zero external dependencies, 100% reliable local fallback)
class TFIDFStore {
  constructor() {
    this.documents = []; // { text, tokens, id }
    this.idf = {};
  }

  addDocuments(texts) {
    this.documents = texts.map((text, idx) => ({
      text,
      tokens: tokenize(text),
      id: idx
    }));

    // Calculate IDF
    const totalDocs = this.documents.length;
    const docFreqs = {};

    this.documents.forEach(doc => {
      const uniqueTokens = new Set(doc.tokens);
      uniqueTokens.forEach(token => {
        docFreqs[token] = (docFreqs[token] || 0) + 1;
      });
    });

    this.idf = {};
    for (const token in docFreqs) {
      this.idf[token] = Math.log(1 + (totalDocs / docFreqs[token]));
    }
  }

  getTF(tokens) {
    const tf = {};
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });
    // Normalize TF
    const total = tokens.length || 1;
    for (const token in tf) {
      tf[token] = tf[token] / total;
    }
    return tf;
  }

  search(query, limit = 5) {
    if (this.documents.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryTF = this.getTF(queryTokens);

    const scores = this.documents.map(doc => {
      const docTF = this.getTF(doc.tokens);
      let score = 0;

      // Cosine similarity approximation using dot product of TF-IDF vectors
      queryTokens.forEach(token => {
        if (docTF[token] && this.idf[token]) {
          const queryVal = queryTF[token] * this.idf[token];
          const docVal = docTF[token] * this.idf[token];
          score += queryVal * docVal;
        }
      });

      return { doc, score };
    });

    // Sort by score descending and return top matches
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(item => item.score > 0 || queryTokens.length === 0) // fallback to returning anything if score is 0
      .map(item => item.doc.text);
  }
}

// Global active store in memory
let activeStore = new TFIDFStore();
let currentWebsiteData = null;

// Chunking function
function chunkText(text, chunkSize = 800, overlap = 150) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

export function indexWebsite(crawledData) {
  currentWebsiteData = crawledData;
  const chunks = chunkText(crawledData.rawText || '');
  
  // Also index structured content as its own chunks to ensure high relevance
  const structureChunks = [];
  if (crawledData.techStack && crawledData.techStack.length > 0) {
    structureChunks.push(`Technology Stack detected: ${crawledData.techStack.join(', ')}`);
  }
  
  if (crawledData.structure && crawledData.structure.headings) {
    const headingTexts = crawledData.structure.headings.map(h => `${h.level}: ${h.text}`).join('\n');
    structureChunks.push(`Website Headings and Page Outline Structure:\n${headingTexts}`);
  }

  if (crawledData.structure && crawledData.structure.forms && crawledData.structure.forms.length > 0) {
    const formsText = crawledData.structure.forms.map((f, idx) => {
      const inputs = f.inputs.map(ip => `- Input name="${ip.name}" type="${ip.type}" placeholder="${ip.placeholder}"`).join('\n');
      return `Form ${idx + 1} action="${f.action}" method="${f.method}":\n${inputs}`;
    }).join('\n\n');
    structureChunks.push(`Forms present on the website:\n${formsText}`);
  }

  const allChunks = [...structureChunks, ...chunks];
  activeStore = new TFIDFStore();
  activeStore.addDocuments(allChunks);
  console.log(`Indexed ${allChunks.length} chunks for ${crawledData.url}`);
}

export async function askQuestion(query) {
  if (!currentWebsiteData) {
    return {
      answer: "No website has been crawled yet. Please crawl a URL first."
    };
  }

  // Retrieve relevant contexts
  const matchedChunks = activeStore.search(query, 5);
  const contextText = matchedChunks.join('\n\n---\n\n');

  const systemPrompt = `You are WebDNA AI, an expert website reverse-engineer and coding tutor.
You are helping a CS student or developer analyze and understand the website: ${currentWebsiteData.url}.

Here is the detected information about the website:
- Title: ${currentWebsiteData.title}
- Tech Stack: ${currentWebsiteData.techStack.join(', ')}
- Description: ${currentWebsiteData.meta.description || 'N/A'}
- Headings: ${JSON.stringify(currentWebsiteData.structure.headings.slice(0, 10))}

Here is the relevant text content retrieved from crawling the website:
---
${contextText}
---

Your goal is to answer the user's questions about the website, its structure, its engineering patterns, and how they can build something similar.
Be educational, technical, and write clean explanations. 
If they ask for code, write clean, modern code examples.
Keep your response concise but detailed where it matters. Focus on how the frontend handles state, how the backend is likely structured, and how the RAG pipeline is working.`;

  try {
    const answer = await callLLM(systemPrompt, query);
    return {
      answer,
      sources: matchedChunks
    };
  } catch (error) {
    console.error("LLM Generation failed:", error);
    return {
      answer: `Error generating response: ${error.message}. Please verify your API keys in the backend .env file.`
    };
  }
}

export async function generateRoadmap() {
  if (!currentWebsiteData) {
    return "No website crawled yet.";
  }

  const systemPrompt = `You are WebDNA AI, an expert website reverse-engineer.
Generate a structured, personalized learning roadmap for a junior developer to build a simplified clone of ${currentWebsiteData.url}.

The website is built with: ${currentWebsiteData.techStack.join(', ')}.
Its structure consists of:
- Title: ${currentWebsiteData.title}
- Headings: ${JSON.stringify(currentWebsiteData.structure.headings.slice(0, 10))}
- Forms: ${JSON.stringify(currentWebsiteData.structure.forms)}

Create a detailed, step-by-step roadmap. Use Markdown formatting.
Structure it into exactly 4 phases:
Phase 1: Project Setup & Foundation (Routing, directories, database schema if applicable)
Phase 2: Core Components & Layout (Building the header, cards, responsive grids using standard CSS)
Phase 3: Logic, APIs, & State Management (Fetching data, handling client interactions, state hooks)
Phase 4: Advanced Features & Deployment (Caching, security, hosting details)

For each phase, write:
- **Goal**: What is the outcome?
- **Key Concepts**: What technologies/concepts will the student learn?
- **Implementation Steps**: Bullet points of what to code.
- **Tutor Advice**: Tips on styling, optimization, or avoiding common pitfalls.

Be specific to this exact website and its detected stack. For example, if they use React, tell them which hooks to use. If they use Tailwind CSS, explain that we'll implement it using modern CSS.`;

  const userQuery = "Generate a personalized step-by-step learning roadmap to rebuild this website.";

  try {
    return await callLLM(systemPrompt, userQuery);
  } catch (error) {
    console.error("Roadmap generation failed:", error);
    return `Error generating roadmap: ${error.message}`;
  }
}

// LLM dispatch helper: supports Gemini (primary) and Groq (fallback/alternative)
async function callLLM(systemPrompt, userPrompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    console.log("Using Gemini API for LLM completion...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nUser Question:\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.2
      }
    };
    
    const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.candidates && response.data.candidates[0].content.parts[0].text) {
      return response.data.candidates[0].content.parts[0].text;
    }
    throw new Error("Invalid response format from Gemini API");
  } 
  
  if (groqKey) {
    console.log("Using Groq API for LLM completion...");
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const payload = {
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2048
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      }
    });

    if (response.data && response.data.choices && response.data.choices[0].message.content) {
      return response.data.choices[0].message.content;
    }
    throw new Error("Invalid response format from Groq API");
  }

  // If no keys are set, provide a mock tutorial walkthrough to prevent crashes
  console.warn("No LLM API keys detected. Returning offline fallback response.");
  return `### [OFFLINE MODE] No API Keys Found
Please configure \`GEMINI_API_KEY\` or \`GROQ_API_KEY\` in your \`backend/.env\` file.

**Offline Analysis Summary of ${currentWebsiteData.url}**:
- **Website Title**: ${currentWebsiteData.title}
- **Detected Stack**: ${currentWebsiteData.techStack.join(', ')}
- **Structure Overview**: The page contains ${currentWebsiteData.structure.headings.length} headings, ${currentWebsiteData.structure.links.internal.length} internal links, and ${currentWebsiteData.structure.imagesCount} images.

*To enable full 1-on-1 tutor chat and dynamically customized roadmaps, please supply an API key in the backend's dotenv configuration and try again.*`;
}

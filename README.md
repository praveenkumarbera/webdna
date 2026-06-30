cd /Users/praveenkumar/.gemini/antigravity/scratch/webdna

cat > README.md << 'EOF'
# 🧬 WebDNA — AI Website Reverse Engineer

> Drop any website URL → WebDNA crawls it, detects the tech stack, generates a personalized learning roadmap, and starts a 1-on-1 AI tutoring session to help you understand how it's built.

🔗 **Live Demo:** [frontend-ivory-kappa-aw6phe5g9x.vercel.app](https://frontend-ivory-kappa-aw6phe5g9x.vercel.app)  
📦 **Backend:** [webdna-backend.onrender.com](https://webdna-backend.onrender.com)

---

## 🚀 What It Does

Most CS students find a website they admire (Swiggy, Razorpay, GitHub) but have no structured way to learn how it was built. WebDNA solves this by:

1. **Crawling** any public website using Puppeteer + Cheerio
2. **Detecting** the tech stack (React, Vue, Tailwind, Next.js, etc.)
3. **Analyzing** site structure — headings, links, forms, page outline
4. **Generating** a personalized step-by-step learning curriculum via RAG + LLM
5. **Starting** a 1-on-1 AI chat session where you can ask anything about the site

---

## ✨ Features

- 🔍 **Tech Stack Detection** — identifies frameworks, libraries, CSS tools from public signals
- 📊 **Site Statistics** — element count, page outline, meta info
- 📚 **Learning Curriculum** — tailored roadmap to rebuild something similar
- 💬 **1-on-1 AI Chat** — ask "How does their nav work?", "What database are they using?", "How do I build a header like theirs?"
- ⚡ **Backend: ONLINE indicator** — real-time connection status
- 🌙 **Glassmorphic dark UI** — clean, modern interface

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| Web Crawling | Puppeteer + Cheerio |
| RAG Pipeline | LangChain + TF-IDF semantic search |
| LLM | Groq API (LLaMA 3) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## 🧠 How It Works

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { crawlUrl } from './crawler.js';
import { indexWebsite, askQuestion, generateRoadmap } from './rag.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  /\.vercel\.app$/,      // all vercel preview/production URLs
  /\.onrender\.com$/     // allow render URLs too
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, etc.)
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.post('/api/crawl', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Validate URL format
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format. Please include http:// or https://' });
  }

  try {
    console.log(`Crawl request received for URL: ${url}`);
    const crawledData = await crawlUrl(url);
    
    // Index the scraped content for RAG
    indexWebsite(crawledData);
    
    // Return layout and structure details to the client
    res.json({
      success: true,
      url: crawledData.url,
      title: crawledData.title,
      techStack: crawledData.techStack,
      meta: crawledData.meta,
      structure: {
        headingsCount: crawledData.structure.headings.length,
        linksCount: crawledData.structure.links.internal.length + crawledData.structure.links.external.length,
        imagesCount: crawledData.structure.imagesCount,
        formsCount: crawledData.structure.forms.length,
        headings: crawledData.structure.headings.slice(0, 15), // top 15 headings
        forms: crawledData.structure.forms
      }
    });
  } catch (error) {
    console.error('Error during crawls:', error);
    res.status(500).json({ error: `Crawling failed: ${error.message}` });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const result = await askQuestion(message);
    res.json(result);
  } catch (error) {
    console.error('Error during chat:', error);
    res.status(500).json({ error: `Chat generation failed: ${error.message}` });
  }
});

app.get('/api/roadmap', async (req, res) => {
  try {
    const roadmap = await generateRoadmap();
    res.json({ roadmap });
  } catch (error) {
    console.error('Error generating roadmap:', error);
    res.status(500).json({ error: `Roadmap generation failed: ${error.message}` });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong on the server!' });
});

app.listen(PORT, () => {
  console.log(`WebDNA Backend server running on http://localhost:${PORT}`);
});

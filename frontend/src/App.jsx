import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Simple, robust Markdown parser helper to avoid installing a heavy markdown library
function parseMarkdown(mdText) {
  if (!mdText) return '';

  let html = mdText;

  // Escape HTML tags to prevent XSS but keep formatting safe
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang ... ```)
  html = html.replace(/```([\s\S]*?)```/g, (match, codeBlock) => {
    // extract first word as language, rest as code
    const parts = codeBlock.trim().split('\n');
    const firstLine = parts[0].trim();
    const isLang = ['javascript', 'js', 'html', 'css', 'python', 'json', 'bash', 'typescript', 'ts'].includes(firstLine.toLowerCase());
    const code = isLang ? parts.slice(1).join('\n') : parts.join('\n');
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Blockquotes (> text)
  html = html.replace(/^\>&nbsp;(.*$)/gim, '<blockquote>$1</blockquote>');
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Unordered list items (- or * item)
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  
  // Wrap list items in <ul>. We approximate this by grouping contiguous <li> elements.
  // A simple replacement that cleans up consecutive <li> tags
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  
  // Convert double newlines into paragraphs
  html = html.replace(/\n\n/g, '<p></p>');
  // Convert single newlines to br
  html = html.replace(/\n/g, '<br />');

  // Fix nesting double ul
  html = html.replace(/<\/ul><br \/><ul>/g, '');
  html = html.replace(/<\/ul><p><\/p><ul>/g, '');

  return html;
}

function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');
  const [crawledData, setCrawledData] = useState(null);
  
  // Roadmap States
  const [roadmap, setRoadmap] = useState('');
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // Chat States
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  
  // API Status
  const [backendStatus, setBackendStatus] = useState('offline');

  const chatEndRef = useRef(null);

  // Check backend server status on mount
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          setBackendStatus('online');
        }
      })
      .catch(() => {
        setBackendStatus('offline');
      });
  }, []);

  // Scroll to bottom of chat history when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleCrawlSubmit = async (e) => {
    e.preventDefault();
    if (!url) return;

    setIsLoading(true);
    setError('');
    setCrawledData(null);
    setRoadmap('');
    setChatHistory([]);
    setProgressText('Connecting to backend...');

    // Progress updates simulation
    const steps = [
      'Spinning up headless browser...',
      'Navigating to website target...',
      'Waiting for DOM nodes to load...',
      'Scraping DOM hierarchy and scripts...',
      'Analyzing stylesheets and design metadata...',
      'Extracting content texts for semantic index...',
      'Analyzing framework signatures...',
      'Building TF-IDF text indices...'
    ];

    let currentStep = 0;
    const progressInterval = setInterval(() => {
      if (currentStep < steps.length) {
        setProgressText(steps[currentStep]);
        currentStep++;
      }
    }, 1800);

    try {
      const response = await fetch(`${API_URL}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      clearInterval(progressInterval);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to crawl website');
      }

      setCrawledData(data);
      setBackendStatus('online');

      // Initialize chat with AI greeting
      setChatHistory([
        {
          role: 'assistant',
          content: `Hi! I have reverse-engineered **${data.title || url}**. I detected: ${data.techStack.join(', ')}.\n\nYou can review the **Learning Roadmap** on the dashboard, or ask me anything here! For example:\n- *"How is their navigation structured?"*\n- *"What CSS frameworks are they using and how?"*\n- *"How can I build a header like theirs?"*`
        }
      ]);

      // Trigger Roadmap Generation
      fetchRoadmap();

    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message || 'An error occurred during crawling.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoadmap = async () => {
    setRoadmapLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/roadmap`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load roadmap');
      }
      setRoadmap(data.roadmap);
    } catch (err) {
      console.error('Roadmap error:', err);
      setRoadmap('Failed to generate roadmap automatically. Please verify backend LLM keys.');
    } finally {
      setRoadmapLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || chatLoading) return;

    const userMsg = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get answer');
      }

      setChatHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, I encountered an error answering that: ${err.message}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Helper to format framework css class styles
  const getBadgeClass = (techName) => {
    return techName.toLowerCase().replace('.', '-').replace(' ', '-');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">🧬</span>
          <h1>Web<span className="gradient-text">DNA</span></h1>
        </div>
        <div className="header-meta">
          <span className={`api-badge ${backendStatus === 'online' ? 'online' : 'offline'}`}>
            Backend: {backendStatus.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Crawler Section */}
      <section className="crawler-section">
        <div className="crawler-container">
          <form className="crawler-form" onSubmit={handleCrawlSubmit}>
            <input
              type="url"
              className="url-input"
              placeholder="Enter website URL to reverse-engineer (e.g. https://react.dev)..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              required
            />
            <button type="submit" className="crawl-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="loader-spinner"></div>
                  Analyzing...
                </>
              ) : (
                'Deconstruct'
              )}
            </button>
          </form>

          {isLoading && (
            <div className="progress-banner">
              <div className="loader-spinner"></div>
              <span>Crawling Phase:</span> {progressText}
            </div>
          )}

          {error && (
            <div style={{
              color: 'var(--accent-error)',
              fontSize: '0.85rem',
              padding: '0.6rem 1rem',
              borderRadius: 'var(--btn-radius)',
              background: 'hsla(0, 85%, 60%, 0.1)',
              border: '1px solid hsla(0, 85%, 60%, 0.2)'
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      </section>

      {/* Main Workspace Dashboard */}
      <main className="workspace">
        {!crawledData ? (
          <div className="welcome-screen">
            <div className="welcome-icon">🧬</div>
            <h2>Understand Any Website</h2>
            <p>
              WebDNA crawls public web pages, automatically detects their tech stack, reverse-engineers layout grids/forms, and serves you a custom learning roadmap + a 1-on-1 AI chat tutor.
            </p>
            <div className="feature-cards">
              <div className="feature-card glass-panel">
                <h3>🔍 Tech Stack Detection</h3>
                <p>Identifies UI frameworks, libraries, styling modules, analytics, and scripts.</p>
              </div>
              <div className="feature-card glass-panel">
                <h3>🗺️ Build Roadmap</h3>
                <p>A step-by-step custom curriculum showing how to build the crawled structure.</p>
              </div>
              <div className="feature-card glass-panel">
                <h3>💬 Interactive Tutor</h3>
                <p>Ask design details: "How does this form submit?", "How can I make this layout responsive?"</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard-grid">
            
            {/* Column 1: Tech Stack & Outline */}
            <aside className="panel-sidebar">
              <div className="panel-header">
                <span>Site Statistics</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>Success</span>
              </div>
              <div className="panel-content">
                
                {/* Meta info */}
                <div className="section-group">
                  <span className="section-title">Site Meta Info</span>
                  <div className="site-meta-card glass-panel">
                    <span className="site-meta-title">{crawledData.title}</span>
                    <a href={crawledData.url} target="_blank" rel="noreferrer" className="site-meta-url">
                      {crawledData.url}
                    </a>
                    {crawledData.meta.description && (
                      <span className="site-meta-desc">{crawledData.meta.description}</span>
                    )}
                  </div>
                </div>

                {/* Tech Stack */}
                <div className="section-group">
                  <span className="section-title">Detected Tech Stack</span>
                  <div className="tech-badges-grid">
                    {crawledData.techStack.map((tech) => (
                      <span 
                        key={tech} 
                        className={`tech-badge ${getBadgeClass(tech)}`}
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="section-group">
                  <span className="section-title">Element Count</span>
                  <div className="stat-pills">
                    <div className="stat-pill">
                      <div className="stat-val">{crawledData.structure.headingsCount}</div>
                      <div className="stat-lbl">Headings</div>
                    </div>
                    <div className="stat-pill">
                      <div className="stat-val">{crawledData.structure.imagesCount}</div>
                      <div className="stat-lbl">Images</div>
                    </div>
                    <div className="stat-pill">
                      <div className="stat-val">{crawledData.structure.linksCount}</div>
                      <div className="stat-lbl">Links</div>
                    </div>
                    <div className="stat-pill">
                      <div className="stat-val">{crawledData.structure.formsCount}</div>
                      <div className="stat-lbl">Forms</div>
                    </div>
                  </div>
                </div>

                {/* Structure Headings outline */}
                {crawledData.structure.headings && crawledData.structure.headings.length > 0 && (
                  <div className="section-group">
                    <span className="section-title">Page Outline Structure</span>
                    <div className="outline-list">
                      {crawledData.structure.headings.map((h, i) => (
                        <div key={i} className={`outline-item ${h.level}`}>
                          {h.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </aside>

            {/* Column 2: Learning Roadmap */}
            <section className="panel-roadmap">
              <div className="panel-header">
                <span>Learning Curriculum</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tailored Roadmap</span>
              </div>
              <div className="roadmap-scroll">
                {roadmapLoading ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-secondary)',
                    gap: '1rem'
                  }}>
                    <div className="loader-spinner" style={{ width: '28px', height: '28px', borderTopColor: 'var(--accent-secondary)' }}></div>
                    <span>Formulating personalized learning phases...</span>
                  </div>
                ) : (
                  <div 
                    className="roadmap-markdown"
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(roadmap) }}
                  />
                )}
              </div>
            </section>

            {/* Column 3: AI 1-on-1 Chat */}
            <section className="panel-chat">
              <div className="panel-header">
                <span>1-on-1 Chat Session</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>AI Code Tutor</span>
              </div>
              
              <div className="chat-history">
                {chatHistory.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`chat-bubble-container ${msg.role}`}
                  >
                    <span className="chat-bubble-header">{msg.role === 'user' ? 'You' : 'WebDNA Tutor'}</span>
                    <div 
                      className="chat-bubble"
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
                    />
                  </div>
                ))}
                
                {chatLoading && (
                  <div className="chat-bubble-container assistant">
                    <span className="chat-bubble-header">WebDNA Tutor</span>
                    <div className="chat-bubble" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="loader-spinner" style={{ width: '12px', height: '12px', borderTopColor: 'var(--accent-secondary)' }}></div>
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input-bar">
                <form className="chat-form" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask how to build components, handle states..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    disabled={chatLoading}
                  />
                  <button 
                    type="submit" 
                    className="chat-send-btn"
                    disabled={!chatMessage.trim() || chatLoading}
                  >
                    🚀
                  </button>
                </form>
              </div>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;

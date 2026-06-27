import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Helper to clean and structure text for RAG
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

export async function crawlUrl(url) {
  console.log(`Starting crawl for: ${url}`);
  let htmlContent = '';
  let screenshot = null;
  let pageTitle = '';
  let metaTags = {};
  let detectedTech = new Set();
  let structure = {
    headings: [],
    links: { internal: [], external: [] },
    forms: [],
    imagesCount: 0,
    scriptsCount: 0,
    stylesheetsCount: 0
  };
  let rawText = '';
  let isPuppeteerSuccessful = false;

  const isProduction = process.env.NODE_ENV === 'production';
  const browserlessToken = process.env.BROWSERLESS_TOKEN;

  let browser = null;
  
  // Try Puppeteer first (enables dynamic JS execution and in-page variable checks)
  // Skip local Puppeteer in production if BROWSERLESS_TOKEN is not set to prevent RAM crashes on Render Free
  if (!isProduction || browserlessToken) {
    try {
      if (browserlessToken) {
        console.log('Connecting to remote Browserless.io service...');
        browser = await puppeteer.connect({
          browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`
        });
      } else {
        console.log('Launching Puppeteer locally...');
        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
      }
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      console.log('Navigating to URL...');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      htmlContent = await page.content();
      pageTitle = await page.title();

      // Detect client-side variables
      const clientVars = await page.evaluate(() => {
        return {
          hasReact: !!(window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')),
          hasNext: !!(window.__NEXT_DATA__),
          hasVue: !!(window.__VUE__ || document.querySelector('[data-v-descriptor]') || Array.from(document.querySelectorAll('*')).some(el => Array.from(el.attributes).some(attr => attr.name.startsWith('data-v-')))),
          hasNuxt: !!(window.__NUXT__),
          hasAngular: !!(window.angular || document.querySelector('[ng-version]')),
          hasSvelte: !!(window.__svelte),
          hasJQuery: !!(window.jQuery || window.$),
          hasAlpine: !!(window.Alpine),
          hasGoogleAnalytics: !!(window.ga || window.gtag || window.google_tag_manager),
          hasStripe: !!(window.Stripe),
          hasTailwind: !!(document.querySelector('[class*="bg-opacity-"]') || document.querySelector('[class*="hover:bg-"]') || Array.from(document.querySelectorAll('*')).some(el => el.className && typeof el.className === 'string' && el.className.split(' ').some(c => c.match(/^(m|p|w|h|bg|text|flex|grid|rounded|border)-/))))
        };
      });

      if (clientVars.hasReact) detectedTech.add('React');
      if (clientVars.hasNext) detectedTech.add('Next.js');
      if (clientVars.hasVue) detectedTech.add('Vue.js');
      if (clientVars.hasNuxt) detectedTech.add('Nuxt.js');
      if (clientVars.hasAngular) detectedTech.add('Angular');
      if (clientVars.hasSvelte) detectedTech.add('Svelte');
      if (clientVars.hasJQuery) detectedTech.add('jQuery');
      if (clientVars.hasAlpine) detectedTech.add('Alpine.js');
      if (clientVars.hasGoogleAnalytics) detectedTech.add('Google Analytics');
      if (clientVars.hasStripe) detectedTech.add('Stripe');
      if (clientVars.hasTailwind) detectedTech.add('Tailwind CSS');

      await browser.close();
      isPuppeteerSuccessful = true;
      console.log('Puppeteer crawl completed successfully');
    } catch (puppeteerError) {
      console.error('Puppeteer crawling failed, falling back to Axios/Cheerio:', puppeteerError.message);
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Error closing browser:', closeError.message);
        }
      }
    }
  } else {
    console.log('Production mode detected without BROWSERLESS_TOKEN. Bypassing Puppeteer to avoid memory limit issues on free tier hosting. Falling back to Axios/Cheerio...');
  }

  // Fallback to Axios if Puppeteer failed or was skipped
  if (!isPuppeteerSuccessful) {
    try {
      console.log('Fetching raw HTML via Axios...');
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
      htmlContent = response.data;
    } catch (axiosError) {
      console.error('Axios fallback failed:', axiosError.message);
      throw new Error(`Failed to crawl URL: ${axiosError.message}`);
    }
  }

  // Parse HTML content using Cheerio
  const $ = cheerio.load(htmlContent);

  // Extract meta tags
  pageTitle = pageTitle || $('title').text().trim();
  $('meta').each((i, el) => {
    const name = $(el).attr('name') || $(el).attr('property');
    const content = $(el).attr('content');
    if (name && content) {
      metaTags[name] = content;
    }
  });

  // Cheerio-based tech stack detection (signatures in HTML)
  const scriptSrcs = [];
  $('script').each((i, el) => {
    const src = $(el).attr('src');
    if (src) scriptSrcs.push(src.toLowerCase());
  });

  const linkHrefs = [];
  $('link').each((i, el) => {
    const href = $(el).attr('href');
    if (href) linkHrefs.push(href.toLowerCase());
  });

  // Check script files & link hrefs for tech identifiers
  const hasScriptMatch = (term) => scriptSrcs.some(src => src.includes(term));
  const hasLinkMatch = (term) => linkHrefs.some(href => href.includes(term));

  if (hasScriptMatch('react') || hasLinkMatch('react')) detectedTech.add('React');
  if (hasScriptMatch('next') || hasScriptMatch('_next')) {
    detectedTech.add('React');
    detectedTech.add('Next.js');
  }
  if (hasScriptMatch('vue') || hasLinkMatch('vue')) detectedTech.add('Vue.js');
  if (hasScriptMatch('angular') || hasLinkMatch('angular')) detectedTech.add('Angular');
  if (hasScriptMatch('jquery') || hasScriptMatch('jquery.min.js')) detectedTech.add('jQuery');
  if (hasScriptMatch('bootstrap') || hasLinkMatch('bootstrap')) detectedTech.add('Bootstrap');
  if (hasScriptMatch('tailwind') || hasLinkMatch('tailwind')) detectedTech.add('Tailwind CSS');
  if (hasScriptMatch('gtm.js') || hasScriptMatch('analytics.js') || hasScriptMatch('googletagmanager')) detectedTech.add('Google Analytics');
  
  // WordPress detection
  if (hasLinkMatch('wp-content') || hasLinkMatch('wp-includes') || hasScriptMatch('wp-embed')) {
    detectedTech.add('WordPress');
    detectedTech.add('PHP');
  }

  // Extract headings
  $('h1, h2, h3, h4, h5, h6').each((i, el) => {
    structure.headings.push({
      level: el.name,
      text: cleanText($(el).text())
    });
  });

  // Extract links
  const parsedUrl = new URL(url);
  const rootDomain = parsedUrl.hostname.replace('www.', '');

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = cleanText($(el).text());
    if (href && href.trim() && !href.startsWith('#') && !href.startsWith('javascript:')) {
      let absoluteUrl = href;
      try {
        absoluteUrl = new URL(href, url).href;
      } catch (e) {}

      const linkObj = { text: text || '[No Text]', url: absoluteUrl };
      
      if (absoluteUrl.includes(rootDomain)) {
        if (structure.links.internal.length < 30) {
          structure.links.internal.push(linkObj);
        }
      } else {
        if (structure.links.external.length < 30) {
          structure.links.external.push(linkObj);
        }
      }
    }
  });

  // Extract images
  structure.imagesCount = $('img').length;
  structure.scriptsCount = $('script').length;
  structure.stylesheetsCount = $('link[rel="stylesheet"]').length;

  // Extract forms
  $('form').each((i, el) => {
    const action = $(el).attr('action') || '';
    const method = $(el).attr('method') || 'get';
    const inputs = [];
    $(el).find('input, select, textarea').each((j, inputEl) => {
      inputs.push({
        type: $(inputEl).attr('type') || inputEl.name,
        name: $(inputEl).attr('name') || '',
        placeholder: $(inputEl).attr('placeholder') || ''
      });
    });
    structure.forms.push({ action, method, inputs });
  });

  // Extract page content text for RAG
  // Focus on content-containing blocks and strip tags like script, style, nav, footer
  const contentSelector = $('body').clone();
  contentSelector.find('script, style, nav, footer, iframe, noscript, header').remove();
  
  const textBlocks = [];
  contentSelector.find('h1, h2, h3, p, li, td, span').each((i, el) => {
    const text = cleanText($(el).text());
    if (text.length > 20) {
      textBlocks.push(text);
    }
  });

  rawText = textBlocks.join('\n');
  if (rawText.length < 100) {
    // Fallback to body text
    rawText = cleanText($('body').text());
  }

  // Deduplicate and filter detected tech
  const techStack = Array.from(detectedTech);
  if (techStack.length === 0) {
    techStack.push('HTML5', 'CSS3', 'JavaScript');
  }

  return {
    url,
    title: pageTitle,
    meta: metaTags,
    techStack,
    structure,
    rawText: rawText.substring(0, 50000) // limit size to 50KB to keep things optimal
  };
}

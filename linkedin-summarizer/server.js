require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const Parser = require('rss-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Top Data & AI RSS feeds
const RSS_FEEDS = [
  { url: 'https://feeds.feedburner.com/venturebeat/SZYF',      source: 'VentureBeat AI',       category: 'AI Industry' },
  { url: 'https://www.technologyreview.com/feed/',              source: 'MIT Technology Review', category: 'AI Research' },
  { url: 'https://artificialintelligence-news.com/feed/',       source: 'AI News',               category: 'AI News' },
  { url: 'https://towardsdatascience.com/feed',                 source: 'Towards Data Science',  category: 'Data Science' },
  { url: 'https://www.kdnuggets.com/feed',                      source: 'KDnuggets',             category: 'Data Science' },
  { url: 'https://blogs.nvidia.com/feed/',                      source: 'NVIDIA Blog',           category: 'AI Hardware & ML' },
  { url: 'https://openai.com/blog/rss/',                        source: 'OpenAI Blog',           category: 'AI Research' },
  { url: 'https://www.deepmind.com/blog/rss.xml',               source: 'Google DeepMind',       category: 'AI Research' },
];

// ── Sample / fallback data (used when RSS feeds are unreachable) ────────────
const SAMPLE_POSTS = [
  {
    title: 'GPT-4o Gets Real-Time Vision: What It Means for Enterprise AI',
    link: 'https://venturebeat.com/ai/gpt-4o-real-time-vision/',
    pubDate: new Date(Date.now() - 2 * 3600000).toISOString(),
    content: "OpenAI's latest multimodal update allows GPT-4o to process live video streams with sub-second latency, opening doors for real-time quality control in manufacturing, medical imaging analysis, and interactive AR applications. Enterprise customers in healthcare and logistics are already piloting the capability.",
    source: 'VentureBeat AI',
    category: 'AI Industry',
    author: 'Kyle Wiggers',
  },
  {
    title: 'The Hidden Cost of Training Large Language Models',
    link: 'https://www.technologyreview.com/2025/llm-training-costs/',
    pubDate: new Date(Date.now() - 5 * 3600000).toISOString(),
    content: "A new study from MIT reveals that training frontier LLMs now consumes more energy than a small country in a year. Researchers propose mixture-of-experts architectures and curriculum learning schedules that can cut compute costs by up to 40% without sacrificing benchmark performance.",
    source: 'MIT Technology Review',
    category: 'AI Research',
    author: 'Will Douglas Heaven',
  },
  {
    title: 'Pandas 3.0 Released: Copy-on-Write and 5x Faster GroupBy',
    link: 'https://towardsdatascience.com/pandas-3-released/',
    pubDate: new Date(Date.now() - 8 * 3600000).toISOString(),
    content: "The long-awaited Pandas 3.0 ships with copy-on-write semantics by default, eliminating the infamous SettingWithCopyWarning for good. The new Arrow-backed GroupBy engine delivers 5x speedups on large datasets and slashes memory usage by 60%. The migration guide covers the handful of breaking API changes.",
    source: 'Towards Data Science',
    category: 'Data Science',
    author: 'Patrick Hoefler',
  },
  {
    title: 'Google DeepMind\'s AlphaFold 3 Predicts Protein-Drug Interactions',
    link: 'https://www.deepmind.com/blog/alphafold-3-drug-interactions',
    pubDate: new Date(Date.now() - 12 * 3600000).toISOString(),
    content: "AlphaFold 3 extends structure prediction to small molecules, DNA, RNA, and now full protein-drug interaction complexes. Pharmaceutical companies report a 10x acceleration in early-stage drug discovery pipelines. The model is available through DeepMind's free research API, with commercial licensing announced for Q3.",
    source: 'Google DeepMind',
    category: 'AI Research',
    author: 'DeepMind Team',
  },
  {
    title: 'NVIDIA Blackwell B200 Benchmarks: 30x Inference Speedup Over H100',
    link: 'https://blogs.nvidia.com/blackwell-b200-benchmarks/',
    pubDate: new Date(Date.now() - 18 * 3600000).toISOString(),
    content: "Early independent benchmarks of NVIDIA's B200 GPU show a 30x inference throughput improvement over the H100 for 70B-parameter models, thanks to the new Transformer Engine 2.0 and FP4 precision support. Cloud providers are already pre-booking B200 clusters for H2 delivery.",
    source: 'NVIDIA Blog',
    category: 'AI Hardware & ML',
    author: 'NVIDIA Research',
  },
  {
    title: 'OpenAI Launches o3: The New Reasoning Frontier',
    link: 'https://openai.com/blog/o3-reasoning-model',
    pubDate: new Date(Date.now() - 24 * 3600000).toISOString(),
    content: "OpenAI's o3 model achieves 87.5% on the ARC-AGI benchmark, a task previously thought to require human-level reasoning. The model uses adaptive compute allocation, spending more \"thinking time\" on harder problems. API access is tiered by reasoning effort level, with costs proportional to tokens used in the internal chain-of-thought.",
    source: 'OpenAI Blog',
    category: 'AI Research',
    author: 'OpenAI',
  },
  {
    title: 'Top 10 Python Libraries for Data Engineers in 2025',
    link: 'https://www.kdnuggets.com/top-python-libraries-data-engineers-2025',
    pubDate: new Date(Date.now() - 30 * 3600000).toISOString(),
    content: "Polars, DuckDB, and dbt have solidified their positions as must-know tools for modern data engineers. The guide covers streaming pipelines with Bytewax, schema evolution with Great Expectations, and how the Arrow IPC format unifies interoperability across the stack. Includes benchmark comparisons vs. legacy Pandas/Spark workflows.",
    source: 'KDnuggets',
    category: 'Data Science',
    author: 'KDnuggets Editorial',
  },
  {
    title: 'EU AI Act Compliance Deadline: What Data Teams Must Do Now',
    link: 'https://artificialintelligence-news.com/eu-ai-act-compliance-2025/',
    pubDate: new Date(Date.now() - 36 * 3600000).toISOString(),
    content: "With the EU AI Act's high-risk system provisions taking effect this month, organizations must complete conformity assessments, maintain detailed model cards, and implement human oversight mechanisms for AI in HR, credit scoring, and healthcare. Legal experts outline a practical 90-day remediation roadmap for teams starting now.",
    source: 'AI News',
    category: 'AI Industry',
    author: 'Ben Wodecki',
  },
  {
    title: 'Fine-Tuning Llama 3 on a Single GPU: A Practical Guide',
    link: 'https://towardsdatascience.com/fine-tuning-llama3-single-gpu/',
    pubDate: new Date(Date.now() - 48 * 3600000).toISOString(),
    content: "Using QLoRA with 4-bit quantization and gradient checkpointing, you can fine-tune Llama 3 70B on a single A100 in under 6 hours. This tutorial walks through data prep with the Alpaca format, hyperparameter selection for PEFT, and evaluation with Eleuther's LM Harness. Reproducible code is on GitHub.",
    source: 'Towards Data Science',
    category: 'Data Science',
    author: 'Maxime Labonne',
  },
  {
    title: 'Microsoft\'s Phi-4 Mini Outperforms Models 10x Its Size',
    link: 'https://venturebeat.com/ai/microsoft-phi-4-mini-benchmarks/',
    pubDate: new Date(Date.now() - 60 * 3600000).toISOString(),
    content: "Microsoft's 3.8B-parameter Phi-4 Mini achieves MMLU scores competitive with models like Mistral 7B and early LLaMA 2 variants, demonstrating that careful synthetic data curation matters more than scale. The model runs on-device on high-end smartphones and is available under the MIT license for commercial use.",
    source: 'VentureBeat AI',
    category: 'AI Industry',
    author: 'Shubham Sharma',
  },
  {
    title: 'Building a Real-Time Feature Store with Redis and Apache Kafka',
    link: 'https://www.kdnuggets.com/realtime-feature-store-redis-kafka',
    pubDate: new Date(Date.now() - 72 * 3600000).toISOString(),
    content: "Feature stores are the missing layer in most ML pipelines. This deep dive shows how to stream feature computation from Kafka into Redis Streams with sub-10ms latency, manage feature versioning with Feast, and serve features to both training and inference endpoints without a consistency gap.",
    source: 'KDnuggets',
    category: 'Data Science',
    author: 'Shay Levy',
  },
  {
    title: 'NVIDIA DGX Spark: A Supercomputer on Your Desk',
    link: 'https://blogs.nvidia.com/dgx-spark-announcement/',
    pubDate: new Date(Date.now() - 96 * 3600000).toISOString(),
    content: "NVIDIA's DGX Spark packs 1 petaFLOP of AI compute into a desktop form factor using the GB10 Grace Blackwell Superchip. Priced at $3,000, it targets researchers and developers who need local inference for 70B+ models without data-center access. Full NVLink connectivity lets two units join into a 2-petaFLOP pod.",
    source: 'NVIDIA Blog',
    category: 'AI Hardware & ML',
    author: 'NVIDIA',
  },
];

// ── Caches ─────────────────────────────────────────────────────────────────
const summaryCache = new Map();
const feedCache = { data: null, timestamp: 0 };
const FEED_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    return result.items.slice(0, 5).map(item => ({
      title: item.title || 'Untitled',
      link: item.link || item.guid || '#',
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      content: item.contentSnippet || item.summary || item.content || '',
      source: feed.source,
      category: feed.category,
      author: item.creator || item.author || feed.source,
    }));
  } catch (err) {
    console.warn(`Feed unavailable (${feed.source}): ${err.message}`);
    return [];
  }
}

async function getAllPosts() {
  const now = Date.now();
  if (feedCache.data && now - feedCache.timestamp < FEED_CACHE_TTL) {
    return feedCache.data;
  }

  // Try live RSS feeds first (with a 12-second total timeout)
  const FEED_TIMEOUT = parseInt(process.env.FEED_TIMEOUT_MS) || 8000;
  const results = await Promise.allSettled(
    RSS_FEEDS.map(f => Promise.race([
      fetchFeed(f),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FEED_TIMEOUT))
    ]))
  );

  const livePosts = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Fall back to sample data if no live posts were fetched
  const posts = livePosts.length >= 5 ? livePosts : SAMPLE_POSTS;

  if (livePosts.length < 5) {
    console.info('Using sample data (RSS feeds unavailable or returned < 5 items)');
  }

  feedCache.data = posts;
  feedCache.timestamp = now;
  return posts;
}

async function summarizePost(post) {
  const cacheKey = post.link;
  if (summaryCache.has(cacheKey)) return summaryCache.get(cacheKey);

  if (!anthropic) {
    // Fallback: first 200 chars of content
    const fallback = post.content
      ? post.content.replace(/<[^>]+>/g, '').trim().slice(0, 220) + '...'
      : 'Click to read the full article.';
    summaryCache.set(cacheKey, fallback);
    return fallback;
  }

  const textToSummarize = post.content
    ? `Title: ${post.title}\n\nContent: ${post.content.replace(/<[^>]+>/g, '').slice(0, 2000)}`
    : `Title: ${post.title}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are summarizing a Data & AI article for a LinkedIn-style feed.
Write a concise 2-3 sentence summary that captures the key insight or finding.
Be direct and informative. Do not start with "This article" or "The post".

${textToSummarize}`
      }]
    });
    const summary = message.content[0].text;
    summaryCache.set(cacheKey, summary);
    return summary;
  } catch (err) {
    console.warn(`Summarization failed for "${post.title}": ${err.message}`);
    const fallback = post.content
      ? post.content.replace(/<[^>]+>/g, '').trim().slice(0, 220) + '...'
      : 'Click to read the full article.';
    summaryCache.set(cacheKey, fallback);
    return fallback;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/posts
app.get('/api/posts', async (req, res) => {
  try {
    const category = req.query.category || 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));

    let posts = await getAllPosts();
    if (category !== 'all') posts = posts.filter(p => p.category === category);

    const start = (page - 1) * limit;
    const pagePosts = posts.slice(start, start + limit);

    const summarized = await Promise.all(
      pagePosts.map(async post => ({ ...post, summary: await summarizePost(post) }))
    );

    res.json({
      posts: summarized,
      total: posts.length,
      page,
      pages: Math.ceil(posts.length / limit),
    });
  } catch (err) {
    console.error('Error in /api/posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const posts = await getAllPosts();
    const categories = ['all', ...new Set(posts.map(p => p.category))];
    res.json({ categories });
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/summarize
app.post('/api/summarize', async (req, res) => {
  const { text, url, title } = req.body;
  if (!text && !url) return res.status(400).json({ error: 'Provide either text or url' });

  try {
    let content = text || '';
    const postTitle = title || 'LinkedIn Post';

    if (url && !text) {
      try {
        const response = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArticleFetcher)' }
        });
        content = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000);
      } catch {
        content = `Article at: ${url}`;
      }
    }

    if (!anthropic) {
      return res.json({
        summary: `[Demo mode — set ANTHROPIC_API_KEY to enable AI summaries]\n\n${content.slice(0, 200)}...`
      });
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize this Data & AI LinkedIn post/article in 3-4 sentences.
Highlight the key insight, finding, or takeaway. Be engaging and informative.

Title: ${postTitle}
Content: ${content}`
      }]
    });

    res.json({ summary: message.content[0].text });
  } catch (err) {
    console.error('Summarization error:', err);
    res.status(500).json({ error: 'Failed to summarize content' });
  }
});

// POST /api/refresh — clear caches
app.post('/api/refresh', (req, res) => {
  feedCache.data = null;
  feedCache.timestamp = 0;
  summaryCache.clear();
  res.json({ message: 'Cache cleared' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nDataPulse AI running at http://localhost:${PORT}`);
  console.log(`Anthropic API: ${anthropic ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}\n`);
});

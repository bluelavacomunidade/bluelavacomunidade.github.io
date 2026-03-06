import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const envFilePath = path.join(repoRoot, '.env.newsletter');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function stripHtml(text) {
  return decodeEntities(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTag(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  return match ? decodeEntities(match[1].trim()) : '';
}

function parseRssItems(xmlText) {
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const items = [];

  const rawItems = xmlText.match(itemRegex) || [];
  for (const rawItem of rawItems) {
    const title = stripHtml(getTag(rawItem, 'title'));
    const link = stripHtml(getTag(rawItem, 'link'));
    const pubDate = stripHtml(getTag(rawItem, 'pubDate'));
    const description = stripHtml(getTag(rawItem, 'description'));

    if (!title || !link) continue;

    items.push({ title, link, pubDate, description });
  }

  return items;
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BlueLavaNewsletterBot/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function asList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function collectSectionItems(sectionName, urls, limit = 6) {
  const allItems = [];
  for (const url of urls) {
    try {
      const xmlText = await fetchText(url);
      const parsed = parseRssItems(xmlText).slice(0, limit);
      allItems.push(...parsed);
    } catch (error) {
      console.error(`[${sectionName}] failed for ${url}: ${error.message}`);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of allItems) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    deduped.push(item);
  }

  return deduped.slice(0, limit);
}

async function discoverFollowingHandles(username) {
  if (!username) return [];

  try {
    const html = await fetchText(`https://x.com/${username}/following`, 15000);
    const regex = /@([A-Za-z0-9_]{1,15})/g;
    const handles = new Set();

    for (const match of html.matchAll(regex)) {
      const handle = match[1]?.toLowerCase();
      if (!handle || handle === username.toLowerCase()) continue;
      handles.add(handle);
    }

    return [...handles].slice(0, 10);
  } catch {
    return [];
  }
}

async function collectXHighlights() {
  const explicitHandles = asList(process.env.X_HANDLES || '');
  const username = (process.env.X_USERNAME || '').replace(/^@/, '');

  let handles = [...explicitHandles];
  if (!handles.length && username) {
    handles = await discoverFollowingHandles(username);
  }

  if (!handles.length) {
    return {
      note: 'X highlights unavailable automatically. Add accounts in X_HANDLES (comma-separated).',
      items: []
    };
  }

  const nitterHosts = ['https://nitter.net', 'https://nitter.poast.org'];
  const highlights = [];

  for (const handle of handles.slice(0, 8)) {
    let added = false;

    for (const host of nitterHosts) {
      try {
        const xml = await fetchText(`${host}/${handle}/rss`, 12000);
        const items = parseRssItems(xml);
        if (items.length) {
          const top = items[0];
          highlights.push({
            handle,
            title: top.title,
            link: top.link,
            pubDate: top.pubDate
          });
          added = true;
          break;
        }
      } catch {
        // Try next mirror
      }
    }

    if (!added) {
      continue;
    }
  }

  if (!highlights.length) {
    return {
      note: 'X highlights could not be fetched from public mirrors at this time.',
      items: []
    };
  }

  return {
    note: `Based on public posts from ${highlights.length} followed accounts/mirrors.`,
    items: highlights
  };
}

function formatSectionHtml(title, items) {
  if (!items.length) {
    return `<h2>${title}</h2><p>No major updates found this week.</p>`;
  }

  const list = items
    .map((item) => {
      const summary = item.description ? ` — ${item.description.slice(0, 180)}` : '';
      const safeSummary = summary.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const datePart = item.pubDate ? `<div style="color:#666;font-size:12px;">${item.pubDate}</div>` : '';
      return `<li style="margin-bottom:10px;"><a href="${item.link}">${item.title}</a>${datePart}<div>${safeSummary}</div></li>`;
    })
    .join('');

  return `<h2>${title}</h2><ul>${list}</ul>`;
}

function formatSectionText(title, items) {
  if (!items.length) return `${title}\n- No major updates found this week.\n`;

  const lines = items.map((item) => {
    const shortDesc = item.description ? ` | ${item.description.slice(0, 140)}` : '';
    return `- ${item.title}\n  ${item.link}${shortDesc}`;
  });

  return `${title}\n${lines.join('\n')}\n`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required setting: ${name} (set it in .env.newsletter)`);
  }
  return value;
}

async function main() {
  loadEnv(envFilePath);

  const language = process.env.LANGUAGE || 'EN';
  const sectionLimit = Number(process.env.SECTION_LIMIT || '6');

  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    dateStyle: 'full'
  }).format(today);

  const aiUrls = [
    'https://news.google.com/rss/search?q=artificial+intelligence+when:7d&hl=en-GB&gl=GB&ceid=GB:en'
  ];

  const economistUrls = [
    'https://news.google.com/rss/search?q=site:economist.com+economy+when:7d&hl=en-GB&gl=GB&ceid=GB:en'
  ];

  const marketingUrls = [
    'https://news.google.com/rss/search?q=marketing+strategy+when:7d&hl=en-GB&gl=GB&ceid=GB:en'
  ];

  const [aiItems, economistItems, marketingItems, xHighlights] = await Promise.all([
    collectSectionItems('AI', aiUrls, sectionLimit),
    collectSectionItems('Economy', economistUrls, sectionLimit),
    collectSectionItems('Marketing', marketingUrls, sectionLimit),
    collectXHighlights()
  ]);

  const xItems = xHighlights.items.map((item) => ({
    title: `@${item.handle}: ${item.title}`,
    link: item.link,
    pubDate: item.pubDate,
    description: ''
  }));

  const subject = `Weekly Briefing: AI, Economy & Marketing — ${dateLabel}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;max-width:740px;margin:0 auto;">
      <h1>Blue Lava Weekly Briefing</h1>
      <p><strong>Date:</strong> ${dateLabel}</p>
      <p><strong>Language:</strong> ${language}</p>
      ${formatSectionHtml('AI News (last 7 days)', aiItems)}
      ${formatSectionHtml('Economy — The Economist mentions (last 7 days)', economistItems)}
      ${formatSectionHtml('Marketing News (last 7 days)', marketingItems)}
      <h2>X Highlights</h2>
      <p>${xHighlights.note}</p>
      ${xItems.length ? `<ul>${xItems
        .map((item) => `<li><a href="${item.link}">${item.title}</a></li>`)
        .join('')}</ul>` : '<p>No X highlights available this run.</p>'}
      <hr/>
      <p style="font-size:12px;color:#666;">
        Notes: Content includes headlines, links, and short original snippets for reading on the go.
        The Economist section includes references and summaries, not full article reproduction.
      </p>
    </div>
  `;

  const text = [
    `Blue Lava Weekly Briefing`,
    `Date: ${dateLabel}`,
    `Language: ${language}`,
    '',
    formatSectionText('AI News (last 7 days)', aiItems),
    formatSectionText('Economy — The Economist mentions (last 7 days)', economistItems),
    formatSectionText('Marketing News (last 7 days)', marketingItems),
    `X Highlights`,
    xHighlights.note,
    ...xItems.map((item) => `- ${item.title}\n  ${item.link}`),
    '',
    'Notes: Headlines + links + short original snippets only.'
  ].join('\n');

  const smtpHost = requireEnv('SMTP_HOST');
  const smtpPort = Number(requireEnv('SMTP_PORT'));
  const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const smtpUser = requireEnv('SMTP_USER');
  const smtpPass = requireEnv('SMTP_PASS');
  const emailFrom = requireEnv('EMAIL_FROM');
  const emailTo = requireEnv('EMAIL_TO');

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  await transporter.verify();

  const sendResult = await transporter.sendMail({
    from: emailFrom,
    to: emailTo,
    subject,
    text,
    html
  });

  console.log(`Newsletter sent successfully: ${sendResult.messageId}`);
}

main().catch((error) => {
  console.error(`Newsletter send failed: ${error.message}`);
  process.exitCode = 1;
});

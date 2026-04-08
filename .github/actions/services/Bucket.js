/**
 * Bucket storage service for uploading reflection entries
 *
 * @module services/Bucket
 * @author AXIVO
 * @license BSD-3-Clause
 */
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { basename, dirname, join } = require('node:path');
const contentPrefix = 'src/content';
const mediaPrefix = 'public';
const reflectionsPrefix = 'claude/reflections';

/**
 * Bucket storage service for uploading reflection entries
 *
 * Parses diary files using mdx comment blocks, builds MDX content,
 * and uploads to R2 with custom metadata for the website prebuild script.
 *
 * @class BucketService
 */
class BucketService {
  /**
   * Creates a new BucketService instance
   *
   * @param {Object} params - Service parameters
   */
  constructor(params) {
    this.logger = params.logger || console;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    this.bucket = process.env.R2_BUCKET || 'axivo-website';
  }

  /**
   * Builds the full MDX file content for an entry
   *
   * @param {Object} entry - Extracted entry
   * @returns {string} Complete MDX content
   */
  buildMdx(entry) {
    const parts = ['---', entry.frontmatter, '---'];
    if (entry.imports) {
      parts.push('', entry.imports);
    }
    parts.push('', `# ${entry.title}`, '', entry.body, '');
    return parts.join('\n');
  }

  /**
   * Extracts date parts from a diary file path
   *
   * @param {string} filePath - Path like .../diary/2025/12/01.md
   * @returns {{ year: string, month: string, day: string } | null}
   */
  extractDate(filePath) {
    const match = filePath.match(/(\d{4})\/(\d{2})\/(\d{2})\.md$/);
    if (!match) {
      return null;
    }
    return { year: match[1], month: match[2], day: match[3] };
  }

  /**
   * Extracts entries from a diary file using mdx comment blocks
   *
   * @param {string} content - Raw diary file content
   * @returns {Array<{ frontmatter: string, slug: string, title: string, body: string, imports: string }>}
   */
  extractEntries(content) {
    const frontmatterPattern = /<!--mdx-frontmatter-[a-f0-9-]+\n([\s\S]*?)-->/g;
    const frontmatters = [...content.matchAll(frontmatterPattern)];
    if (frontmatters.length === 0) {
      return [];
    }
    const entries = [];
    for (let i = 0; i < frontmatters.length; i++) {
      const fm = frontmatters[i][1].trim();
      const titleMatch = fm.match(/^title: (.+)$/m);
      const title = titleMatch ? titleMatch[1] : '';
      const slug = this.slugify(title);
      if (!slug) {
        continue;
      }
      const fmStart = frontmatters[i].index;
      const fmEnd = i + 1 < frontmatters.length
        ? frontmatters[i + 1].index
        : content.length;
      let entryContent = content.slice(fmStart, fmEnd).trim();
      entryContent = entryContent.replace(/<!--mdx-frontmatter-[a-f0-9-]+\n[\s\S]*?-->\n?/, '');
      entryContent = entryContent.replace(/<!--mdx-strip-start-->[\s\S]*?<!--mdx-strip-end-->\n?/g, '');
      let imports = '';
      entryContent = entryContent.replace(/<!--mdx-component-[a-f0-9-]+\n([\s\S]*?)-->/g, (_, block) => {
        const lines = block.trim().split('\n');
        const importLines = [];
        const componentLines = [];
        for (const line of lines) {
          if (line.startsWith('import ')) {
            importLines.push(line);
          } else {
            componentLines.push(line);
          }
        }
        if (importLines.length) {
          imports += importLines.join('\n') + '\n';
        }
        return componentLines.join('\n');
      });
      entryContent = entryContent.replace(/\/diary\/(\d{4})\/(\d{2})\/(\d{2})\.md/g, `/${reflectionsPrefix}/$1/$2/$3`);
      entryContent = entryContent.replace(/\/diary\/(\d{4})\/(\d{2})\/media\//g, `/${reflectionsPrefix}/media/$1/$2/`);
      entryContent = entryContent.replace(/\n{3,}/g, '\n\n').trim();
      entries.push({ frontmatter: fm, slug, title, body: entryContent, imports: imports.trim() });
    }
    return entries;
  }

  /**
   * Parses frontmatter string into metadata object for R2 custom metadata
   *
   * @param {string} frontmatter - YAML frontmatter string
   * @returns {Object} Metadata key-value pairs
   */
  parseMetadata(frontmatter) {
    const metadata = {};
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+): (.+)$/);
      if (match && !['description', 'tags'].includes(match[1])) {
        metadata[match[1]] = match[2];
      }
    }
    const tagsMatch = frontmatter.match(/tags:\n([\s\S]*?)(?:\n\w|$)/);
    if (tagsMatch) {
      const tagList = tagsMatch[1].trim().split('\n').map(t => t.replace(/^\s*- /, ''));
      metadata.tags = JSON.stringify(tagList);
    }
    const descMatch = frontmatter.match(/description: >-\n\s+(.+)/);
    if (descMatch) {
      metadata.description = encodeURIComponent(descMatch[1]);
    }
    return metadata;
  }

  /**
   * Uploads media files associated with a diary date directory.
   *
   * @param {string} filePath - Path to diary .md file
   * @returns {Promise<number>} Number of media files uploaded
   */
  async processMedia(filePath) {
    const date = this.extractDate(filePath);
    if (!date) {
      return 0;
    }
    const mediaDir = join(dirname(filePath), 'media');
    if (!existsSync(mediaDir)) {
      return 0;
    }
    const mimeTypes = {
      jpg: 'image/jpeg',
      mp4: 'video/mp4',
      png: 'image/png',
      webp: 'image/webp'
    };
    let count = 0;
    for (const entry of readdirSync(mediaDir)) {
      const fullPath = join(mediaDir, entry);
      if (!statSync(fullPath).isFile()) {
        continue;
      }
      const key = `${mediaPrefix}/${reflectionsPrefix}/media/${date.year}/${date.month}/${entry}`;
      const ext = basename(entry).split('.').pop();
      const body = readFileSync(fullPath);
      await this.upload(key, body, mimeTypes[ext] || 'application/octet-stream');
      this.logger.info(`Uploaded ${key} (${body.length} bytes)`);
      count++;
    }
    return count;
  }

  /**
   * Processes a diary file and uploads entries to R2
   *
   * @param {string} filePath - Path to diary .md file
   * @returns {Promise<number>} Number of entries uploaded
   */
  async processFile(filePath) {
    const date = this.extractDate(filePath);
    if (!date) {
      return 0;
    }
    const content = readFileSync(filePath, 'utf-8');
    const entries = this.extractEntries(content);
    if (entries.length === 0) {
      return 0;
    }
    let count = 0;
    for (const entry of entries) {
      const key = `${contentPrefix}/${reflectionsPrefix}/${date.year}/${date.month}/${date.day}/${entry.slug}.mdx`;
      const mdx = this.buildMdx(entry);
      const metadata = this.parseMetadata(entry.frontmatter);
      await this.upload(key, mdx, 'text/plain', metadata);
      this.logger.info(`Uploaded ${key} (${mdx.length} bytes)`);
      count++;
    }
    return count;
  }

  /**
   * Generates a URL slug from a title
   *
   * @param {string} title - Entry title
   * @returns {string} URL-safe slug
   */
  slugify(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Uploads content to R2
   *
   * @param {string} key - R2 object key
   * @param {Buffer|string} body - Content to upload
   * @param {string} [contentType] - MIME type
   * @param {Object} [metadata] - Custom metadata
   * @returns {Promise<boolean>} Success
   */
  async upload(key, body, contentType = 'text/plain', metadata = {}) {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata
    }));
    return true;
  }
}

module.exports = BucketService;

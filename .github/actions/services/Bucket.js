/**
 * Bucket storage service for uploading reflection entries
 *
 * @module services/Bucket
 * @author AXIVO
 * @license BSD-3-Clause
 */
const { dirname, join } = require('node:path');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { slug: githubSlug } = require('github-slugger');
const mime = require('mime-types');
const config = require('../config');
const contentPrefix = 'src/content';
const features = {
  syntax: [
    'code'
  ]
};
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
   * Builds the renderable MDX content for an entry.
   * Excludes frontmatter since it is stored as R2 custom metadata.
   *
   * @param {Object} entry - Extracted entry
   * @returns {string} MDX content body
   */
  buildMdx(entry) {
    return `# ${entry.title}\n\n${entry.body}\n`;
  }

  /**
   * Deletes all R2 objects under the prefix derived from a diary file path
   *
   * @param {string} filePath - Path like diary/2025/12/01.md
   * @returns {Promise<number>} Number of entries deleted
   */
  async deleteFile(filePath) {
    const date = this.extractDate(filePath);
    if (!date) {
      return 0;
    }
    const prefix = `${contentPrefix}/${reflectionsPrefix}/${date.year}/${date.month}/${date.day}/`;
    const list = await this.s3.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    }));
    const objects = list.Contents || [];
    if (!objects.length) {
      return 0;
    }
    await this.s3.send(new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: objects.map(object => ({ Key: object.Key }))
      }
    }));
    for (const object of objects) {
      this.logger.info(`Deleted ${object.Key}`);
    }
    return objects.length;
  }

  /**
   * Deletes a single media R2 object derived from a diary media file path
   *
   * @param {string} filePath - Path like diary/2025/12/media/14-first-light.webp
   * @returns {Promise<number>} 1 if deleted, 0 otherwise
   */
  async deleteMedia(filePath) {
    const match = filePath.match(/diary\/(\d{4})\/(\d{2})\/media\/(.+)$/);
    if (!match) {
      return 0;
    }
    const key = `${mediaPrefix}/${reflectionsPrefix}/${match[1]}/${match[2]}/${match[3]}`;
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));
    this.logger.info(`Deleted ${key}`);
    return 1;
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
   * @param {string} filePath - Path to diary file for error reporting
   * @returns {Array<{ frontmatter: string, slug: string, title: string, body: string }>}
   */
  extractEntries(content, filePath) {
    const uuidPattern = /<!--mdx-frontmatter-([^\n]+)\n/g;
    const validUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    for (const match of content.matchAll(uuidPattern)) {
      if (!validUuid.test(match[1])) {
        throw new Error(`Invalid UUID "${match[1]}" in <!--mdx-frontmatter--> block (${filePath})`);
      }
    }
    const frontmatterPattern = /<!--mdx-frontmatter-[a-f0-9-]+\n([\s\S]*?)-->/g;
    const frontmatters = [...content.matchAll(frontmatterPattern)];
    if (frontmatters.length === 0) {
      return [];
    }
    const domain = config.get('workflow.domain');
    const variables = {
      domain: `${domain.protocol}://${domain.name}`
    };
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
      entryContent = entryContent.replace(/<!--mdx-component-[a-f0-9-]+\n([\s\S]*?)-->/g, (_, block) => block.trim());
      entryContent = entryContent.replace(/(?<![\w.\/-])\/diary\/(\d{4})\/(\d{2})\/(\d{2})\.md/g, `/${reflectionsPrefix}/$1/$2/$3`);
      entryContent = entryContent.replace(/(?<![\w.\/-])\/diary\/(\d{4})\/(\d{2})\/media\//g, `/${reflectionsPrefix}/$1/$2/`);
      entryContent = entryContent.replace(/(?<![\w.\/-])\/diary\/(\d{4})\/(\d{2})(?!\/)/g, `/${reflectionsPrefix}/$1/$2`);
      entryContent = entryContent.replace(/(?<![\w.\/-])\/diary\/(\d{4})(?!\/)/g, `/${reflectionsPrefix}/$1`);
      entryContent = entryContent.replace(/\n{3,}/g, '\n\n').trim();
      entryContent = entryContent.replace(/https:\/\/axivo\.com/g, '');
      for (const [name, value] of Object.entries(variables)) {
        entryContent = entryContent.replace(new RegExp(`<!--mdx-variable-${name}-->`, 'g'), value);
      }
      entries.push({ frontmatter: fm, slug, title, body: entryContent });
    }
    return entries;
  }

  /**
   * Parses frontmatter string into metadata object for R2 custom metadata
   *
   * @param {string} frontmatter - YAML frontmatter string
   * @param {string} filePath - Path to diary file for error reporting
   * @returns {Object} Metadata key-value pairs
   */
  parseMetadata(frontmatter, filePath) {
    const metadata = {};
    const metadataKeys = ['author', 'date', 'source', 'template', 'title'];
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+): (.+)$/);
      if (match && !['description', 'features', 'tags'].includes(match[1])) {
        metadata[match[1]] = match[2];
      }
    }
    const missingKeys = metadataKeys.filter(key => !metadata[key]);
    if (missingKeys.length) {
      const word = missingKeys.length === 1 ? 'key' : 'keys';
      throw new Error(`Missing metadata ${word} (${missingKeys.map(k => `"${k}"`).join(', ')}) in "${metadata.title}" entry (${filePath})`);
    }
    const tagsMatch = frontmatter.match(/tags:\n([\s\S]*?)(?:\n\w|$)/);
    if (tagsMatch) {
      const tagList = tagsMatch[1].trim().split('\n').map(t => t.replace(/^\s*- #?/, '').replace(/-/g, '_'));
      metadata.tags = JSON.stringify(tagList);
    }
    const descriptionMatch = frontmatter.match(/description: >-\n\s+(.+)/);
    if (descriptionMatch) {
      metadata.description = encodeURIComponent(descriptionMatch[1]);
    }
    const featuresMatch = frontmatter.match(/^features:\n((?:\s+.+\n?)+)/m);
    if (featuresMatch) {
      const pairs = [];
      const typeBlocks = featuresMatch[1].matchAll(/^\s+(\w+):\n((?:\s+- .+\n?)+)/gm);
      for (const typeMatch of typeBlocks) {
        const type = typeMatch[1];
        const names = typeMatch[2].trim().split('\n').map(n => n.replace(/^\s*-\s*/, '').trim());
        if (!features[type]) {
          throw new Error(`Unknown feature type '${type}:${names[0]}' in '${filePath}' entry`);
        }
        for (const name of names) {
          if (!features[type].includes(name)) {
            throw new Error(`Unknown feature name '${type}:${name}' in '${filePath}' entry`);
          }
          const pair = `${type}:${name}`;
          if (!pairs.includes(pair)) {
            pairs.push(pair);
          }
        }
      }
      if (pairs.length) {
        metadata.features = JSON.stringify(pairs.sort());
      }
    }
    for (const [key, value] of Object.entries(metadata)) {
      if (value.length > 2048) {
        throw new Error(`Metadata "${key}" key exceeds 2048 bytes (${value.length} bytes) in "${metadata.title}" entry (${filePath})`);
      }
    }
    const totalBytes = Object.values(metadata).reduce((sum, value) => sum + value.length, 0);
    if (totalBytes > 8192) {
      throw new Error(`Total metadata exceeds 8192 bytes (${totalBytes} bytes) in "${metadata.title}" entry (${filePath})`);
    }
    return metadata;
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
    const entries = this.extractEntries(content, filePath);
    if (entries.length === 0) {
      return 0;
    }
    let count = 0;
    for (const entry of entries) {
      const key = `${contentPrefix}/${reflectionsPrefix}/${date.year}/${date.month}/${date.day}/${entry.slug}.mdx`;
      const mdx = this.buildMdx(entry);
      const metadata = this.parseMetadata(entry.frontmatter, filePath);
      await this.upload(key, mdx, 'text/plain', metadata);
      this.logger.info(`Uploaded ${key} (${mdx.length} bytes)`);
      count++;
    }
    return count;
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
    let count = 0;
    for (const entry of readdirSync(mediaDir)) {
      const fullPath = join(mediaDir, entry);
      if (!statSync(fullPath).isFile()) {
        continue;
      }
      const key = `${mediaPrefix}/${reflectionsPrefix}/${date.year}/${date.month}/${entry}`;
      const body = readFileSync(fullPath);
      await this.upload(key, body, mime.lookup(entry) || 'application/octet-stream');
      this.logger.info(`Uploaded ${key} (${body.length} bytes)`);
      count++;
    }
    return count;
  }

  /**
   * Uploads a single media R2 object derived from a diary media file path
   *
   * @param {string} filePath - Path like diary/2025/12/media/14-first-light.webp
   * @returns {Promise<number>} 1 if uploaded, 0 otherwise
   */
  async uploadMedia(filePath) {
    const match = filePath.match(/diary\/(\d{4})\/(\d{2})\/media\/(.+)$/);
    if (!match) {
      return 0;
    }
    const key = `${mediaPrefix}/${reflectionsPrefix}/${match[1]}/${match[2]}/${match[3]}`;
    const body = readFileSync(filePath);
    await this.upload(key, body, mime.lookup(match[3]) || 'application/octet-stream');
    this.logger.info(`Uploaded ${key} (${body.length} bytes)`);
    return 1;
  }

  /**
   * Generates a URL slug from a title
   *
   * @param {string} title - Entry title
   * @returns {string} URL-safe slug
   */
  slugify(title) {
    return githubSlug(title);
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

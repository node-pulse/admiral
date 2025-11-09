# Community Playbook Repository

**Status**: Implemented (Simplified Architecture)
**Created**: 2025-11-02
**Updated**: 2025-11-08

---

## Overview

The community playbook system enables users to browse and install pre-built Ansible playbooks from a centralized GitHub repository (`github.com/node-pulse/playbooks`). This feature provides a curated collection of deployment recipes, similar to Homebrew formulae.

### Architecture: Simplified, Database-Free

```
GitHub Repository (Source of Truth)
github.com/node-pulse/playbooks/catalog/f/fail2ban/
    ↓
Cloudflare Worker + D1 Database (Catalog Registry)
https://registry.nodepulse.sh/api/catalog
    ↓ (CRON sync every 6-24 hours)
Admiral Instances (Browse from registry)
    ↓ (User clicks "Install")
Download files from GitHub → ansible/catalog/f/fail2ban/
    ↓
User executes playbook
```

### Key Design Decisions

1. **No Local Database** - Playbook catalog served by Cloudflare Worker
2. **Filesystem-Based Downloads** - Files stored in `ansible/catalog/` (mirrors GitHub)
3. **Download Check** - `File::exists('ansible/catalog/f/fail2ban/manifest.json')`
4. **Centralized Registry** - Single source of truth for all Admiral instances worldwide
5. **Random Playbook IDs** - Format `pb_[A-Za-z0-9]{10}` for global uniqueness (no slug collisions across forks)

---

## GitHub Repository Structure

```
github.com/node-pulse/playbooks/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── .github/
│   └── workflows/
│       └── syntax-check.yml          # CI validation
│
├── schemas/
│   └── node-pulse-admiral-playbook-manifest-v1.schema.json
│
├── scripts/                          # Validation scripts
│   ├── find-changed-playbooks.sh
│   ├── validate-ansible-lint.sh
│   ├── validate-category.sh
│   ├── validate-entry-point.sh
│   ├── validate-json-schema.sh
│   ├── validate-json-syntax.sh
│   ├── validate-manifest-fields.sh
│   ├── validate-no-external-deps.sh
│   ├── validate-os-support.sh
│   └── validate-unique-ids.sh
│
└── catalog/                          # Playbook catalog (a-z directories)
    ├── f/
    │   └── fail2ban/
    │       ├── manifest.json
    │       ├── playbook.yml
    │       └── templates/
    │           ├── jail.local.j2
    │           ├── sshd.local.j2
    │           └── webhook.conf.j2
    │
    ├── m/
    │   └── meilisearch/
    │       └── manifest.json
    │
    └── ... (a-z)
```

**Why 26 directories (a-z)?**
- Easy navigation on GitHub
- Simple directory listing via GitHub API
- Scales to thousands of playbooks
- No massive index files

---

## Manifest Format

### Schema: `manifest.json`

Every playbook **must** include `manifest.json` in its root directory.

**JSON Schema**: `https://raw.githubusercontent.com/node-pulse/playbooks/main/schemas/node-pulse-admiral-playbook-manifest-v1.schema.json`

### Full Example

```json
{
  "$schema": "https://raw.githubusercontent.com/node-pulse/playbooks/main/schemas/node-pulse-admiral-playbook-manifest-v1.schema.json",

  "id": "pb_Xk7nM2pQw9",
  "name": "Fail2Ban Intrusion Prevention",
  "version": "1.0.0",
  "description": "Install and configure Fail2Ban to protect SSH from brute-force attacks",

  "author": {
    "name": "Node Pulse Community",
    "email": "community@nodepulse.io",
    "url": "https://github.com/node-pulse",
    "status": "verified"
  },

  "category": "security",
  "tags": ["security", "ssh", "fail2ban", "intrusion-prevention"],

  "homepage": "https://github.com/node-pulse/playbooks/tree/main/catalog/f/fail2ban",
  "repository": "https://github.com/node-pulse/playbooks",

  "entry_point": "playbook.yml",

  "ansible_version": ">=2.10",

  "os_support": [
    {
      "distro": "ubuntu",
      "version": "22.04",
      "arch": "both"
    },
    {
      "distro": "debian",
      "version": "12",
      "arch": "both"
    }
  ],

  "variables": [
    {
      "name": "webhook_url",
      "label": "Webhook URL (optional)",
      "type": "string",
      "default": "",
      "description": "HTTP endpoint to receive ban/unban notifications as JSON",
      "required": false,
      "pattern": "^(https?://.*)?$"
    },
    {
      "name": "bantime",
      "label": "Ban Time (seconds)",
      "type": "integer",
      "default": 3600,
      "description": "Duration to ban offending IPs",
      "required": false,
      "min": 60,
      "max": 86400
    }
  ],

  "license": "MIT"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique random identifier (format: `pb_[A-Za-z0-9]{10}`) |
| `name` | string | Yes | Display name for UI |
| `version` | string | Yes | Semantic version (e.g., "1.0.0") |
| `description` | string | Yes | Short description (max 200 chars) |
| `author` | object | Yes | Author information (name, email, url, status) |
| `author.status` | string | No | Trust badge: `community`, `verified`, `deprecated` |
| `category` | string | Yes | One of: `monitoring`, `database`, `search`, `security`, `proxy`, `storage`, `dev-tools` |
| `tags` | string[] | Yes | Searchable tags (max 10) |
| `entry_point` | string | Yes | Main playbook file (e.g., "playbook.yml") |
| `ansible_version` | string | Yes | Minimum Ansible version (e.g., ">=2.10") |
| `os_support` | array | Yes | Array of OS compatibility objects |
| `variables` | array | No | Variable definitions (array format with name+label) |
| `license` | string | Yes | SPDX license identifier |

### Playbook ID Format

**CRITICAL**: Playbook IDs must be **globally unique random strings**, not slugs.

**Format**: `pb_[A-Za-z0-9]{10}`
**Example**: `pb_Xk7nM2pQw9`

**Generate a unique ID:**
```bash
# Using Python (recommended)
python3 -c "import random, string; print('pb_' + ''.join(random.choices(string.ascii_letters + string.digits, k=10)))"

# Using OpenSSL + base64
echo "pb_$(openssl rand -base64 8 | tr -dc 'A-Za-z0-9' | head -c10)"
```

**Why random IDs?**
- Uniqueness cannot be enforced in GitHub (anyone can fork)
- 62^10 = 839 quadrillion combinations (collision-free)
- CI validates no duplicate IDs in repository

### Variable Types

Each variable must include both `name` (Ansible variable) and `label` (UI display):

| Type | Validation | UI Rendering |
|------|------------|--------------|
| `string` | Optional `pattern` regex | Text input |
| `integer` | Optional `min`/`max` | Number input |
| `boolean` | N/A | Checkbox |
| `select` | Requires `options` array | Dropdown |
| `password` | N/A | Password input (hidden) |

### OS Support Schema

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `distro` | string | Yes | `ubuntu`, `debian`, `centos`, `rhel`, `rocky`, `alma` |
| `version` | string | Yes | OS version (e.g., "22.04", "11", "9") |
| `arch` | string | Yes | `amd64`, `arm64`, `both` |

---

## Cloudflare Worker Registry

### Architecture

**Cloudflare Worker**: `registry.nodepulse.sh`
**Database**: D1 (serverless SQL)
**Sync Frequency**: Every 6-24 hours (CRON trigger)
**Repository**: `https://github.com/node-pulse/registry` (separate from playbooks repo)

### D1 Database Schema

**Database Name**: `nodepulse_registry`

**Table: `playbooks`**
```sql
CREATE TABLE playbooks (
  id TEXT PRIMARY KEY,                    -- pb_Xk7nM2pQw9
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_url TEXT,
  author_status TEXT,                     -- community, verified, deprecated
  category TEXT NOT NULL,
  tags TEXT NOT NULL,                     -- JSON array as string
  homepage TEXT,
  repository TEXT,
  entry_point TEXT NOT NULL,
  ansible_version TEXT NOT NULL,
  os_support TEXT NOT NULL,               -- JSON array as string
  variables TEXT,                         -- JSON array as string (nullable)
  license TEXT NOT NULL,
  source_path TEXT NOT NULL,              -- catalog/f/fail2ban
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_category ON playbooks(category);
CREATE INDEX idx_author_status ON playbooks(author_status);
CREATE INDEX idx_updated_at ON playbooks(updated_at);
```

**Table: `sync_metadata`**
```sql
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Initial data
INSERT INTO sync_metadata (key, value, updated_at) VALUES
  ('last_sync', '1970-01-01T00:00:00Z', datetime('now')),
  ('total_playbooks', '0', datetime('now')),
  ('sync_status', 'idle', datetime('now'));
```

### API Endpoints

#### 1. GET /api/catalog

**Public API** - Returns all playbooks from D1 database

**URL**: `https://registry.nodepulse.sh/api/catalog`

**Query Parameters:**
- `category` (optional): Filter by category (e.g., `security`, `database`)
- `search` (optional): Search in name, description, tags
- `author_status` (optional): Filter by author status (`verified`, `community`)

**Response Format:**
```json
{
  "playbooks": [
    {
      "id": "pb_Xk7nM2pQw9",
      "name": "Fail2Ban Intrusion Prevention",
      "version": "1.0.0",
      "description": "Install and configure Fail2Ban to protect SSH from brute-force attacks",
      "author": {
        "name": "Node Pulse Community",
        "email": "community@nodepulse.io",
        "url": "https://github.com/node-pulse",
        "status": "verified"
      },
      "category": "security",
      "tags": ["security", "ssh", "fail2ban", "intrusion-prevention"],
      "source_path": "catalog/f/fail2ban",
      "entry_point": "playbook.yml",
      "ansible_version": ">=2.10",
      "os_support": [
        {"distro": "ubuntu", "version": "22.04", "arch": "both"}
      ],
      "variables": [
        {
          "name": "webhook_url",
          "label": "Webhook URL (optional)",
          "type": "string",
          "default": "",
          "required": false
        }
      ],
      "license": "MIT",
      "homepage": "https://github.com/node-pulse/playbooks/tree/main/catalog/f/fail2ban",
      "repository": "https://github.com/node-pulse/playbooks"
    }
  ],
  "metadata": {
    "synced_at": "2025-11-08T12:00:00Z",
    "total": 1,
    "sync_status": "success"
  }
}
```

**Example Usage:**
```bash
# Get all playbooks
curl https://registry.nodepulse.sh/api/catalog

# Filter by category
curl https://registry.nodepulse.sh/api/catalog?category=security

# Search
curl https://registry.nodepulse.sh/api/catalog?search=docker

# Verified playbooks only
curl https://registry.nodepulse.sh/api/catalog?author_status=verified
```

#### 2. GET /api/health

**Health Check** - Returns sync status and database stats

**URL**: `https://registry.nodepulse.sh/api/health`

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "last_sync": "2025-11-08T12:00:00Z",
  "total_playbooks": 42,
  "sync_status": "success"
}
```

### Worker Implementation

**File Structure** (in `node-pulse/registry` repository):
```
registry/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── handlers/
│   │   ├── catalog.ts        # GET /api/catalog handler
│   │   ├── health.ts         # GET /api/health handler
│   │   └── sync.ts           # CRON sync handler
│   ├── services/
│   │   ├── github.ts         # GitHub API client
│   │   ├── database.ts       # D1 database operations
│   │   └── validator.ts      # Manifest validation
│   └── types.ts              # TypeScript types
├── wrangler.toml             # Cloudflare configuration
├── schema.sql                # D1 database schema
├── package.json
└── tsconfig.json
```

#### Main Worker (`src/index.ts`)

```typescript
import { catalog } from './handlers/catalog';
import { health } from './handlers/health';
import { syncPlaybooks } from './handlers/sync';

export interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
}

export default {
  // HTTP request handler
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      if (url.pathname === '/api/catalog') {
        return await catalog(request, env, corsHeaders);
      }

      if (url.pathname === '/api/health') {
        return await health(request, env, corsHeaders);
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },

  // Scheduled CRON handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('CRON trigger:', event.cron);
    ctx.waitUntil(syncPlaybooks(env));
  },
};
```

#### Catalog Handler (`src/handlers/catalog.ts`)

```typescript
import { Env } from '../index';

export async function catalog(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const authorStatus = url.searchParams.get('author_status');

  let query = 'SELECT * FROM playbooks WHERE 1=1';
  const params: string[] = [];

  // Apply filters
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (authorStatus) {
    query += ' AND author_status = ?';
    params.push(authorStatus);
  }

  if (search) {
    query += ` AND (
      name LIKE ? OR
      description LIKE ? OR
      tags LIKE ?
    )`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY updated_at DESC';

  // Execute query
  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Parse JSON fields
  const playbooks = results.map((row: any) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: {
      name: row.author_name,
      email: row.author_email,
      url: row.author_url,
      status: row.author_status,
    },
    category: row.category,
    tags: JSON.parse(row.tags),
    source_path: row.source_path,
    entry_point: row.entry_point,
    ansible_version: row.ansible_version,
    os_support: JSON.parse(row.os_support),
    variables: row.variables ? JSON.parse(row.variables) : [],
    license: row.license,
    homepage: row.homepage,
    repository: row.repository,
  }));

  // Get metadata
  const metadataQuery = await env.DB.prepare(
    'SELECT key, value FROM sync_metadata'
  ).all();

  const metadata: Record<string, string> = {};
  metadataQuery.results.forEach((row: any) => {
    metadata[row.key] = row.value;
  });

  return new Response(
    JSON.stringify({
      playbooks,
      metadata: {
        synced_at: metadata.last_sync,
        total: parseInt(metadata.total_playbooks),
        sync_status: metadata.sync_status,
      },
    }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    }
  );
}
```

#### Sync Handler (`src/handlers/sync.ts`)

```typescript
import { Env } from '../index';
import { fetchPlaybooksFromGitHub } from '../services/github';
import { validateManifest } from '../services/validator';

export async function syncPlaybooks(env: Env): Promise<void> {
  console.log('Starting sync...');

  try {
    // Update sync status
    await env.DB.prepare(
      "UPDATE sync_metadata SET value = 'syncing', updated_at = datetime('now') WHERE key = 'sync_status'"
    ).run();

    const playbooks = await fetchPlaybooksFromGitHub(env.GITHUB_TOKEN);
    let successCount = 0;

    for (const playbook of playbooks) {
      try {
        // Validate manifest
        const validation = validateManifest(playbook);
        if (!validation.valid) {
          console.error(`Invalid manifest for ${playbook.id}:`, validation.errors);
          continue;
        }

        // Upsert into database
        await env.DB.prepare(`
          INSERT INTO playbooks (
            id, name, version, description,
            author_name, author_email, author_url, author_status,
            category, tags, homepage, repository,
            entry_point, ansible_version, os_support, variables,
            license, source_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            description = excluded.description,
            author_name = excluded.author_name,
            author_email = excluded.author_email,
            author_url = excluded.author_url,
            author_status = excluded.author_status,
            category = excluded.category,
            tags = excluded.tags,
            homepage = excluded.homepage,
            repository = excluded.repository,
            entry_point = excluded.entry_point,
            ansible_version = excluded.ansible_version,
            os_support = excluded.os_support,
            variables = excluded.variables,
            license = excluded.license,
            source_path = excluded.source_path,
            updated_at = datetime('now')
        `).bind(
          playbook.id,
          playbook.name,
          playbook.version,
          playbook.description,
          playbook.author.name,
          playbook.author.email || null,
          playbook.author.url || null,
          playbook.author.status || 'community',
          playbook.category,
          JSON.stringify(playbook.tags),
          playbook.homepage || null,
          playbook.repository || null,
          playbook.entry_point,
          playbook.ansible_version,
          JSON.stringify(playbook.os_support),
          playbook.variables ? JSON.stringify(playbook.variables) : null,
          playbook.license,
          playbook.source_path
        ).run();

        successCount++;
      } catch (error) {
        console.error(`Error syncing playbook ${playbook.id}:`, error);
      }
    }

    // Update metadata
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE sync_metadata SET value = datetime('now'), updated_at = datetime('now') WHERE key = 'last_sync'"
      ),
      env.DB.prepare(
        "UPDATE sync_metadata SET value = ?, updated_at = datetime('now') WHERE key = 'total_playbooks'"
      ).bind(successCount.toString()),
      env.DB.prepare(
        "UPDATE sync_metadata SET value = 'success', updated_at = datetime('now') WHERE key = 'sync_status'"
      ),
    ]);

    console.log(`Sync complete: ${successCount} playbooks`);
  } catch (error) {
    console.error('Sync failed:', error);

    await env.DB.prepare(
      "UPDATE sync_metadata SET value = 'error', updated_at = datetime('now') WHERE key = 'sync_status'"
    ).run();
  }
}
```

#### GitHub Service (`src/services/github.ts`)

```typescript
export async function fetchPlaybooksFromGitHub(token: string): Promise<any[]> {
  const playbooks: any[] = [];
  const baseUrl = 'https://api.github.com/repos/node-pulse/playbooks/contents/catalog';

  // Fetch all letter directories (a-z)
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  for (const letter of letters) {
    try {
      const dirUrl = `${baseUrl}/${letter}`;
      const response = await fetch(dirUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'NodePulse-Registry',
        },
      });

      if (response.status === 404) {
        // Directory doesn't exist yet, skip
        continue;
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const contents = await response.json();

      // Iterate through playbook directories
      for (const item of contents) {
        if (item.type !== 'dir') continue;

        try {
          // Fetch manifest.json
          const manifestUrl = `https://raw.githubusercontent.com/node-pulse/playbooks/main/catalog/${letter}/${item.name}/manifest.json`;
          const manifestResponse = await fetch(manifestUrl);

          if (!manifestResponse.ok) {
            console.error(`Missing manifest for ${letter}/${item.name}`);
            continue;
          }

          const manifest = await manifestResponse.json();
          manifest.source_path = `catalog/${letter}/${item.name}`;
          playbooks.push(manifest);
        } catch (error) {
          console.error(`Error fetching manifest for ${letter}/${item.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error fetching directory ${letter}:`, error);
    }
  }

  return playbooks;
}
```

#### Validator Service (`src/services/validator.ts`)

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(manifest: any): ValidationResult {
  const errors: string[] = [];

  // Required fields
  const requiredFields = [
    'id', 'name', 'version', 'description',
    'author', 'category', 'tags', 'entry_point',
    'ansible_version', 'os_support', 'license'
  ];

  for (const field of requiredFields) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate ID format
  if (manifest.id && !/^pb_[A-Za-z0-9]{10}$/.test(manifest.id)) {
    errors.push(`Invalid ID format: ${manifest.id}`);
  }

  // Validate category
  const validCategories = [
    'monitoring', 'database', 'search', 'security',
    'proxy', 'storage', 'dev-tools'
  ];
  if (manifest.category && !validCategories.includes(manifest.category)) {
    errors.push(`Invalid category: ${manifest.category}`);
  }

  // Validate author
  if (manifest.author && !manifest.author.name) {
    errors.push('Missing author.name');
  }

  // Validate tags
  if (manifest.tags && (!Array.isArray(manifest.tags) || manifest.tags.length === 0)) {
    errors.push('Tags must be a non-empty array');
  }

  // Validate os_support
  if (manifest.os_support && !Array.isArray(manifest.os_support)) {
    errors.push('os_support must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Deployment Configuration

**File**: `wrangler.toml`

```toml
name = "nodepulse-registry"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[env.production]
name = "nodepulse-registry"
route = { pattern = "registry.nodepulse.sh/*", zone_name = "nodepulse.sh" }

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "nodepulse_registry"
database_id = "YOUR_D1_DATABASE_ID"

# Environment variables
[vars]
ENVIRONMENT = "production"

# Secrets (set via wrangler secret put)
# GITHUB_TOKEN = "ghp_xxxxxxxxxxxxx"

# CRON triggers
[triggers]
crons = ["0 */12 * * *"]  # Every 12 hours
```

### Setup Instructions

#### 1. Create D1 Database

```bash
# Create database
wrangler d1 create nodepulse_registry

# Apply schema
wrangler d1 execute nodepulse_registry --file=schema.sql

# Verify tables
wrangler d1 execute nodepulse_registry --command="SELECT name FROM sqlite_master WHERE type='table'"
```

#### 2. Configure Secrets

```bash
# Set GitHub personal access token
wrangler secret put GITHUB_TOKEN
# Paste your GitHub token (needs repo read access)
```

#### 3. Deploy Worker

```bash
# Install dependencies
npm install

# Deploy to Cloudflare
wrangler deploy

# Test deployment
curl https://registry.nodepulse.sh/api/health
```

#### 4. Manual Sync (First Run)

```bash
# Trigger CRON manually for initial sync
wrangler d1 execute nodepulse_registry --command="UPDATE sync_metadata SET value = 'pending' WHERE key = 'sync_status'"

# Or use Cloudflare dashboard to trigger CRON
```

### Monitoring and Logs

**View Logs:**
```bash
wrangler tail nodepulse-registry
```

**Check Sync Status:**
```bash
curl https://registry.nodepulse.sh/api/health
```

**Query Database:**
```bash
# List all playbooks
wrangler d1 execute nodepulse_registry --command="SELECT id, name, version FROM playbooks"

# Check sync metadata
wrangler d1 execute nodepulse_registry --command="SELECT * FROM sync_metadata"

# Count playbooks by category
wrangler d1 execute nodepulse_registry --command="SELECT category, COUNT(*) FROM playbooks GROUP BY category"
```

### Performance Considerations

1. **Edge Caching**: Responses cached at Cloudflare edge (1 hour TTL)
2. **Database Indexes**: Optimized for common queries (category, author_status, updated_at)
3. **Batch Operations**: D1 batch API for atomic metadata updates
4. **Rate Limiting**: GitHub API requests spread across 12-hour sync window
5. **Error Handling**: Individual playbook failures don't stop entire sync

### Cost Estimate

**Cloudflare Workers Free Tier:**
- 100,000 requests/day
- 400,000 GB-s CPU time/day
- D1: 5GB storage, 5M reads/day, 100K writes/day

**Expected Usage:**
- Registry API: ~10,000 requests/day (well within free tier)
- CRON sync: 2 runs/day (~500 playbooks = 500 DB writes)
- Database size: <10MB (thousands of playbooks)

**Result**: $0/month for typical usage

---

## Admiral Implementation

### Backend: PlaybookDownloader Service

**File**: `flagship/app/Services/PlaybookDownloader.php`

```php
const REGISTRY_URL = 'https://registry.nodepulse.sh/api/catalog';
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/node-pulse/playbooks/main';

// Storage path (mirrors GitHub structure)
$this->storagePath = base_path('ansible/catalog');

// Browse playbooks (fetch from registry)
public function browse(): array
{
    $response = Http::get(self::REGISTRY_URL);
    return $response->json()['playbooks'];
}

// List downloaded playbooks (scan filesystem)
public function listDownloaded(): array
{
    // Scan ansible/catalog/ for manifest.json files
}

// Download playbook (fetch from GitHub)
public function download(string $playbookId, string $sourcePath): array
{
    // Download files to ansible/catalog/{letter}/{name}/
}

// Remove playbook (delete directory)
public function remove(string $playbookId): void
{
    // Remove ansible/catalog/{letter}/{name}/
}
```

### Directory Structure After Download

```
ansible/
├── nodepulse/                    # Built-in playbooks
│   ├── deploy.yml
│   └── uninstall.yml
│
├── catalog/                      # Community playbooks (mirrors GitHub)
│   ├── f/
│   │   └── fail2ban/
│   │       ├── manifest.json
│   │       ├── playbook.yml
│   │       └── templates/
│   └── m/
│       └── meilisearch/
│           └── manifest.json
│
├── ansible.cfg
└── README.md
```

### Frontend: Playbooks Index

**Route**: `/dashboard/playbooks`
**File**: `flagship/resources/js/pages/playbooks/index.tsx`

**Features:**
- Two tabs: Browse (from registry) and Downloaded (from filesystem)
- Search and category filtering
- One-click download
- Remove with confirmation

### Deployment Integration

**File**: `flagship/resources/js/pages/deployments/create.tsx`

**Playbook Path Format:**
- Built-in: `nodepulse/deploy.yml`
- Community: `catalog/f/fail2ban/playbook.yml`

**Dynamic Variables:**
- Parses `manifest.json` variables array
- Generates form fields automatically
- Supports all variable types (string, integer, boolean, select, password)

---

## CI Validation

### GitHub Actions Workflow

**File**: `.github/workflows/syntax-check.yml`

**Triggers:**
- Push to `main` branch (catalog files only)
- Pull requests (catalog files only)
- Manual workflow dispatch

**Validation Steps:**
1. JSON syntax validation
2. JSON Schema validation (Draft-07)
3. Required fields check
4. Playbook ID format validation (`pb_[A-Za-z0-9]{10}`)
5. Entry point file existence
6. YAML syntax check
7. ansible-lint (warnings OK)
8. Category validation
9. Zero external dependencies check
10. OS support format validation
11. Unique playbook ID check (no duplicates)

### Validation Scripts

All scripts located in `scripts/` directory:
- `validate-json-syntax.sh` - Check JSON syntax with jq
- `validate-json-schema.sh` - Validate against JSON Schema with check-jsonschema
- `validate-manifest-fields.sh` - Check required fields and ID format
- `validate-entry-point.sh` - Verify entry point file exists
- `validate-yaml-syntax.sh` - Ansible YAML syntax check
- `validate-ansible-lint.sh` - Run ansible-lint (warnings OK)
- `validate-category.sh` - Check valid category
- `validate-no-external-deps.sh` - Ensure no requirements.yml
- `validate-os-support.sh` - Validate OS support format
- `validate-unique-ids.sh` - Check for duplicate playbook IDs

---

## Self-Contained Playbooks: Zero External Dependencies

**CRITICAL REQUIREMENT**: Every playbook must be completely self-contained.

### Rules

1. ✅ **All code must be in the playbook directory**
2. ✅ **You can use Ansible Galaxy role/collection code**, but must copy it locally
3. ✅ **All templates, files, roles, tasks must be included**
4. ❌ **No `requirements.yml` files** (Admiral doesn't run `ansible-galaxy install`)
5. ❌ **No external fetching** - only download from this GitHub repository

### Why Self-Contained?

**Reliability:**
- No broken external dependencies
- Works offline
- Predictable behavior

**Security:**
- All code is reviewed
- No supply chain attacks
- Full transparency

**Simplicity:**
- One directory download
- One command execution
- No dependency resolution

### How to Use Galaxy Code

**Example: Using `geerlingguy.docker` role**

```bash
# 1. Download the role locally
ansible-galaxy install geerlingguy.docker -p ./roles

# 2. Include in your playbook
- name: Install Docker
  import_role:
    name: roles/geerlingguy.docker

# 3. Credit in README.md
## Credits
This playbook includes code from:
- geerlingguy.docker (MIT License) - https://github.com/geerlingguy/ansible-role-docker
```

---

## Contribution Guide

### Quick Start

1. Fork `github.com/node-pulse/playbooks`
2. Create playbook directory: `catalog/{letter}/{playbook-name}/`
3. Add required files:
   - `manifest.json` (required)
   - `playbook.yml` (or custom entry point)
   - `templates/` (optional)
   - `files/` (optional)
   - `README.md` (recommended)
4. Test locally
5. Submit pull request

### Validation Checklist

Before submitting a PR:

- [ ] `manifest.json` exists and is valid JSON
- [ ] All required fields present
- [ ] Playbook ID in correct format: `pb_[A-Za-z0-9]{10}`
- [ ] Entry point file exists
- [ ] YAML syntax valid: `ansible-playbook --syntax-check playbook.yml`
- [ ] ansible-lint passes (warnings OK)
- [ ] Category is valid
- [ ] Version follows semantic versioning (MAJOR.MINOR.PATCH)
- [ ] **No `requirements.yml` file**
- [ ] **No external role/collection references**
- [ ] All templates, files, roles copied locally
- [ ] Galaxy code credited in README

### Testing Locally

```bash
# Validate JSON
jq empty catalog/f/fail2ban/manifest.json

# Validate against schema
check-jsonschema --schemafile schemas/node-pulse-admiral-playbook-manifest-v1.schema.json catalog/f/fail2ban/manifest.json

# Check YAML syntax
ansible-playbook --syntax-check catalog/f/fail2ban/playbook.yml

# Run linter
ansible-lint catalog/f/fail2ban/playbook.yml

# Check for external dependencies
find catalog/f/fail2ban -name "requirements.yml"  # Should return nothing
```

---

## FAQ

**Q: How often does Admiral fetch new playbooks?**
A: Admiral fetches from Cloudflare registry every time you visit the Browse tab. The registry syncs from GitHub every 6-24 hours.

**Q: Can I use this playbook without Admiral?**
A: Yes! Clone the repository and run playbooks with `ansible-playbook` directly.

**Q: How do I update a downloaded playbook?**
A: Remove and re-download. Automatic updates coming in future versions.

**Q: Why random IDs instead of slugs?**
A: Uniqueness cannot be enforced in GitHub. Anyone can fork and create `fail2ban` playbook. Random IDs prevent collisions.

**Q: Can I use Ansible Galaxy roles?**
A: Yes, but you must copy the role code into your playbook directory. No external fetching allowed.

**Q: What happens if GitHub is down?**
A: You can still execute downloaded playbooks (they're local). Browsing/downloading requires GitHub access.

**Q: Can I submit proprietary playbooks?**
A: No, all playbooks must be MIT licensed and open source.

---

## Future Enhancements

1. **Automatic Updates**
   - Notify when installed playbooks have new versions
   - One-click update
   - Version pinning

2. **Advanced Filtering**
   - Filter by OS compatibility
   - Sort by popularity
   - Related playbooks

3. **Community Features**
   - Star/favorite playbooks
   - Usage statistics
   - Comments/reviews

4. **Multi-Registry Support**
   - Add custom playbook registries
   - Private/enterprise registries
   - Registry prioritization

---

## References

- **Repository**: https://github.com/node-pulse/playbooks
- **Registry**: https://registry.nodepulse.sh/api/catalog
- **Ansible Best Practices**: https://docs.ansible.com/ansible/latest/tips_tricks/ansible_tips_tricks.html
- **JSON Schema Draft-07**: https://json-schema.org/draft-07/schema

---

**Document Status**: Current
**Last Updated**: 2025-11-08
**Owner**: Engineering Team

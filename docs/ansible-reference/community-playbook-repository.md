# Community Playbook Repository Specification

**Status**: Phase 2.5 - Planned
**Target**: Post-MVP (After custom playbook upload feature)
**Created**: 2025-11-02
**Updated**: 2025-11-03

---

## Overview

Enable users to install pre-built Ansible playbooks from a community-maintained GitHub repository (`github.com/node-pulse/playbooks`). This feature provides a curated collection of deployment recipes similar to Homebrew formulae.

### Goals

1. **Easy Discovery** - Browse community playbooks by category/tags
2. **One-Click Install** - Download and install playbooks directly from GitHub
3. **Quality Assurance** - CI-validated playbooks with standardized metadata
4. **Contribution Model** - PR-based workflow (like Homebrew)
5. **Minimal Infrastructure** - No complex marketplace, GitHub is the source of truth
6. **Self-contained and Zero Dependency** - Playbooks must work standalone without external dependencies

### Core Principles

**Self-contained and Zero External Dependencies**
- Every playbook must be completely self-contained within its directory
- You can use code from Ansible Galaxy roles/collections, but must include a local copy in your playbook directory
- No external fetching - we only download files from this GitHub repository
- No `requirements.yml` files (Admiral doesn't run `ansible-galaxy install`)
- All templates, files, roles, and tasks must be included in the playbook package
- Users should be able to download and execute immediately without fetching external dependencies
- This ensures reliability, predictability, ease of maintenance, and full code review

### Non-Goals

- Complex signing/verification (trust GitHub + maintainer review)
- Paid/commercial playbooks
- User ratings/reviews (Phase 3+)
- Automatic updates (Phase 3+)
- External Ansible Galaxy dependencies

---

## Architecture

### High-Level Flow

```
GitHub Repository (Source of Truth)
    ↓ (Sync every 6 hours via cron)
Admiral Database (Metadata Cache)
    ↓ (User browses/searches)
Admiral UI (Display playbooks)
    ↓ (User clicks "Install")
Download Files from GitHub/jsDelivr CDN
    ↓
Save to Filesystem + Database
    ↓
User Executes Playbook
```

### GitHub Repository Structure

```
github.com/node-pulse/playbooks/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── .github/
│   └── workflows/
│       └── validate-playbook.yml   # CI validation
│
├── a/
│   ├── ansible-hardening/
│   │   ├── manifest.json
│   │   ├── playbook.yml
│   │   ├── templates/
│   │   └── README.md
│   └── apache2/
│       └── manifest.json
│
├── b/
│   └── blackbox-exporter/
│       ├── manifest.json
│       └── playbook.yml
│
├── m/
│   ├── meilisearch/
│   │   ├── manifest.json
│   │   ├── playbook.yml
│   │   ├── templates/
│   │   │   ├── config.j2
│   │   │   └── systemd.service.j2
│   │   └── files/
│   │       └── healthcheck.sh
│   └── mongodb/
│       └── manifest.json
│
├── n/
│   └── node-exporter/
│       ├── manifest.json
│       └── playbook.yml
│
├── v/
│   └── valkey/
│       ├── manifest.json
│       ├── playbook.yml
│       └── templates/
│
└── ... (z)
```

**Why 26 directories (a-z)?**
- Avoids massive `index.json` file
- Easy navigation on GitHub
- Simple directory listing via GitHub API
- Scales to thousands of playbooks

---

## Manifest Format

### Required File: `manifest.json`

Every playbook package **must** include `manifest.json` in its root directory.

### Full Schema

```json
{
  "$schema": "https://node-pulse.github.io/schemas/playbook-manifest-v1.json",

  "id": "meilisearch",
  "name": "Meilisearch Single Node",
  "version": "1.2.0",
  "description": "Deploy Meilisearch search engine with systemd service and health checks",

  "author": {
    "name": "Node Pulse Community",
    "email": "community@nodepulse.io",
    "url": "https://github.com/node-pulse"
  },

  "homepage": "https://github.com/node-pulse/playbooks/tree/main/m/meilisearch",
  "repository": "https://github.com/node-pulse/playbooks",

  "category": "search",
  "tags": ["search", "database", "api", "full-text"],

  "entry_point": "playbook.yml",

  "structure": {
    "playbook": "playbook.yml",
    "templates": [
      "templates/config.j2",
      "templates/systemd.service.j2"
    ],
    "files": [
      "files/healthcheck.sh"
    ]
  },

  "requirements": {
    "ansible_version": ">=2.15",
    "os": ["ubuntu-20.04", "ubuntu-22.04", "debian-11", "debian-12"],
    "arch": ["amd64", "arm64"]
  },

  "variables": {
    "port": {
      "type": "integer",
      "default": 7700,
      "description": "HTTP listen port for Meilisearch",
      "required": false,
      "min": 1024,
      "max": 65535
    },
    "master_key": {
      "type": "string",
      "description": "Master API key (auto-generated if not provided)",
      "required": false,
      "secret": true
    },
    "data_dir": {
      "type": "string",
      "default": "/var/lib/meilisearch",
      "description": "Data directory path",
      "required": false,
      "pattern": "^/[a-zA-Z0-9/_-]+$"
    },
    "version": {
      "type": "string",
      "default": "1.5.1",
      "description": "Meilisearch version to install",
      "required": false
    }
  },

  "health_checks": [
    {
      "type": "http",
      "url": "http://127.0.0.1:{{ port }}/health",
      "expect_status": 200,
      "timeout": 5
    }
  ],

  "dangerous_operations": [
    "Opens firewall port {{ port }}",
    "Creates systemd service 'meilisearch'",
    "Downloads binary from GitHub releases"
  ],

  "license": "MIT",

  "created_at": "2025-10-15T12:00:00Z",
  "updated_at": "2025-11-01T08:30:00Z"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (slug), must match directory name |
| `name` | string | Yes | Display name for UI |
| `version` | string | Yes | Semantic version (e.g., "1.2.0") |
| `description` | string | Yes | Short description (max 200 chars) |
| `author` | object | Yes | Author information |
| `category` | string | Yes | One of: `monitoring`, `database`, `search`, `security`, `proxy`, `storage`, `dev-tools` |
| `tags` | string[] | Yes | Searchable tags (max 10) |
| `entry_point` | string | Yes | Main playbook file to execute (e.g., "playbook.yml") |
| `structure` | object | Yes | File manifest (what files exist) |
| `requirements` | object | Yes | System requirements |
| `variables` | object | No | Variable definitions for form generation |
| `health_checks` | array | No | Post-install health check definitions |
| `dangerous_operations` | string[] | No | Warning messages for risky operations |
| `license` | string | Yes | SPDX license identifier |

### Categories

Supported categories:

- `monitoring` - Exporters, agents, observability tools
- `database` - PostgreSQL, MySQL, MongoDB, Redis, etc.
- `search` - Meilisearch, Elasticsearch, Typesense
- `security` - Fail2ban, Wazuh, ClamAV, SSH hardening
- `proxy` - Caddy, Nginx, HAProxy
- `storage` - SeaweedFS, MinIO, backup tools
- `dev-tools` - Docker, Git, build tools

### Variable Types

| Type | Validation | UI Rendering |
|------|-----------|--------------|
| `string` | Optional `pattern` regex | Text input |
| `integer` | Optional `min`/`max` | Number input |
| `boolean` | N/A | Checkbox |
| `select` | `options: []` array | Dropdown |
| `password` | `secret: true` | Password input (hidden) |

---

## Database Schema

### New Table: `admiral.community_playbooks`

```sql
CREATE TABLE admiral.community_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity (from manifest.json)
    slug VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,

    -- GitHub location
    github_path VARCHAR(255) NOT NULL,  -- e.g., "m/meilisearch/"
    github_repo VARCHAR(255) DEFAULT 'node-pulse/playbooks',
    github_branch VARCHAR(50) DEFAULT 'main',

    -- Full manifest (stored as JSONB for flexibility)
    manifest JSONB NOT NULL,

    -- Extracted fields for indexing/filtering
    category VARCHAR(50),
    tags TEXT[],
    author_name VARCHAR(255),

    -- Stats
    install_count INTEGER DEFAULT 0,

    -- Sync metadata
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_community_playbooks_slug ON admiral.community_playbooks(slug);
CREATE INDEX idx_community_playbooks_category ON admiral.community_playbooks(category);
CREATE INDEX idx_community_playbooks_tags ON admiral.community_playbooks USING GIN(tags);
CREATE INDEX idx_community_playbooks_manifest ON admiral.community_playbooks USING GIN(manifest);
CREATE INDEX idx_community_playbooks_name_search ON admiral.community_playbooks
    USING GIN(to_tsvector('english', name || ' ' || description));

-- View for active playbooks
CREATE VIEW admiral.active_community_playbooks AS
SELECT
    id,
    slug,
    name,
    version,
    description,
    category,
    tags,
    author_name,
    install_count,
    manifest->>'entry_point' as entry_point,
    manifest->'requirements' as requirements,
    last_synced_at,
    created_at
FROM admiral.community_playbooks
ORDER BY install_count DESC, name ASC;
```

### Update Existing Table: `admiral.playbooks`

Link user-installed playbooks to community catalog:

```sql
ALTER TABLE admiral.playbooks
ADD COLUMN community_playbook_id UUID REFERENCES admiral.community_playbooks(id) ON DELETE SET NULL;

CREATE INDEX idx_playbooks_community ON admiral.playbooks(community_playbook_id);
```

---

## Backend Implementation

### 1. Sync Job (Submarines - Go)

**File**: `submarines/internal/jobs/sync_community_playbooks.go`

```go
package jobs

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"

    "github.com/jmoiron/sqlx"
    "github.com/rs/zerolog/log"
)

type GitHubContent struct {
    Name string `json:"name"`
    Type string `json:"type"`
    Path string `json:"path"`
}

type Manifest struct {
    ID          string   `json:"id"`
    Name        string   `json:"name"`
    Version     string   `json:"version"`
    Description string   `json:"description"`
    Author      Author   `json:"author"`
    Category    string   `json:"category"`
    Tags        []string `json:"tags"`
    EntryPoint  string   `json:"entry_point"`
}

type Author struct {
    Name  string `json:"name"`
    Email string `json:"email"`
    URL   string `json:"url"`
}

func SyncCommunityPlaybooks(db *sqlx.DB) error {
    repo := "node-pulse/playbooks"
    branch := "main"

    log.Info().Msg("Starting community playbook sync from GitHub")

    totalSynced := 0
    totalErrors := 0

    // Iterate through a-z directories
    for _, letter := range "abcdefghijklmnopqrstuvwxyz" {
        dirURL := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s?ref=%s",
            repo, string(letter), branch)

        // Fetch directory listing
        dirs, err := fetchGitHubDirectory(dirURL)
        if err != nil {
            log.Warn().Err(err).Str("letter", string(letter)).Msg("Failed to fetch directory")
            continue
        }

        // Process each playbook directory
        for _, dir := range dirs {
            if dir.Type != "dir" {
                continue
            }

            // Fetch manifest.json
            manifestURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s/manifest.json",
                repo, branch, string(letter), dir.Name)

            manifest, err := fetchManifest(manifestURL)
            if err != nil {
                log.Warn().
                    Err(err).
                    Str("playbook", dir.Name).
                    Msg("Invalid manifest, skipping")
                totalErrors++
                continue
            }

            // Validate manifest
            if err := validateManifest(manifest); err != nil {
                log.Warn().
                    Err(err).
                    Str("playbook", dir.Name).
                    Msg("Manifest validation failed, skipping")
                totalErrors++
                continue
            }

            // Upsert into database
            githubPath := fmt.Sprintf("%s/%s/", string(letter), dir.Name)

            manifestJSON, _ := json.Marshal(manifest)

            _, err = db.Exec(`
                INSERT INTO admiral.community_playbooks
                (slug, name, version, description, github_path, github_repo, github_branch,
                 manifest, category, tags, author_name, last_synced_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    version = EXCLUDED.version,
                    description = EXCLUDED.description,
                    manifest = EXCLUDED.manifest,
                    category = EXCLUDED.category,
                    tags = EXCLUDED.tags,
                    author_name = EXCLUDED.author_name,
                    last_synced_at = NOW()
            `,
                manifest.ID,
                manifest.Name,
                manifest.Version,
                manifest.Description,
                githubPath,
                repo,
                branch,
                manifestJSON,
                manifest.Category,
                manifest.Tags,
                manifest.Author.Name,
            )

            if err != nil {
                log.Error().Err(err).Str("playbook", dir.Name).Msg("Failed to upsert playbook")
                totalErrors++
                continue
            }

            totalSynced++
            log.Debug().Str("playbook", manifest.Name).Msg("Synced playbook")
        }
    }

    log.Info().
        Int("synced", totalSynced).
        Int("errors", totalErrors).
        Msg("Community playbook sync completed")

    return nil
}

func fetchGitHubDirectory(url string) ([]GitHubContent, error) {
    client := &http.Client{Timeout: 10 * time.Second}

    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Set("Accept", "application/vnd.github.v3+json")

    // Use GitHub token if available to avoid rate limiting
    if token := os.Getenv("GITHUB_TOKEN"); token != "" {
        req.Header.Set("Authorization", "Bearer "+token)
    }

    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
    }

    var contents []GitHubContent
    if err := json.NewDecoder(resp.Body).Decode(&contents); err != nil {
        return nil, err
    }

    return contents, nil
}

func fetchManifest(url string) (*Manifest, error) {
    client := &http.Client{Timeout: 10 * time.Second}

    resp, err := client.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("manifest not found (status %d)", resp.StatusCode)
    }

    var manifest Manifest
    if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
        return nil, fmt.Errorf("invalid JSON: %w", err)
    }

    return &manifest, nil
}

func validateManifest(m *Manifest) error {
    if m.ID == "" {
        return fmt.Errorf("missing required field: id")
    }
    if m.Name == "" {
        return fmt.Errorf("missing required field: name")
    }
    if m.Version == "" {
        return fmt.Errorf("missing required field: version")
    }
    if m.EntryPoint == "" {
        return fmt.Errorf("missing required field: entry_point")
    }
    if m.Category == "" {
        return fmt.Errorf("missing required field: category")
    }

    validCategories := map[string]bool{
        "monitoring": true,
        "database":   true,
        "search":     true,
        "security":   true,
        "proxy":      true,
        "storage":    true,
        "dev-tools":  true,
    }

    if !validCategories[m.Category] {
        return fmt.Errorf("invalid category: %s", m.Category)
    }

    return nil
}
```

**Cron Schedule** (add to `submarines/cmd/digest/main.go` or separate worker):

```go
import "github.com/robfig/cron/v3"

func main() {
    // ... existing setup ...

    // Schedule community playbook sync every 6 hours
    c := cron.New()
    c.AddFunc("0 */6 * * *", func() {
        if err := jobs.SyncCommunityPlaybooks(db); err != nil {
            log.Error().Err(err).Msg("Failed to sync community playbooks")
        }
    })
    c.Start()

    // ... rest of application ...
}
```

### 2. API Endpoints (Flagship - Laravel)

**File**: `flagship/routes/api.php`

```php
// Community playbook routes
Route::middleware(['auth:sanctum'])->prefix('community-playbooks')->group(function () {
    Route::get('/', [CommunityPlaybookController::class, 'index']);
    Route::get('/{slug}', [CommunityPlaybookController::class, 'show']);
    Route::post('/{slug}/install', [CommunityPlaybookController::class, 'install']);
});
```

**File**: `flagship/app/Http/Controllers/CommunityPlaybookController.php`

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;
use App\Models\Playbook;
use App\Models\CommunityPlaybook;

class CommunityPlaybookController extends Controller
{
    /**
     * List all community playbooks
     */
    public function index(Request $request)
    {
        $query = DB::table('admiral.community_playbooks');

        // Filter by category
        if ($request->has('category')) {
            $query->where('category', $request->category);
        }

        // Filter by tags
        if ($request->has('tags')) {
            $tags = is_array($request->tags) ? $request->tags : [$request->tags];
            $query->where(function($q) use ($tags) {
                foreach ($tags as $tag) {
                    $q->orWhereRaw('? = ANY(tags)', [$tag]);
                }
            });
        }

        // Search by name/description
        if ($request->has('search')) {
            $search = $request->search;
            $query->whereRaw(
                "to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', ?)",
                [$search]
            );
        }

        $playbooks = $query
            ->orderBy('install_count', 'desc')
            ->orderBy('name', 'asc')
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'playbooks' => $playbooks->items(),
            'meta' => [
                'current_page' => $playbooks->currentPage(),
                'per_page' => $playbooks->perPage(),
                'total' => $playbooks->total(),
            ]
        ]);
    }

    /**
     * Get single playbook details
     */
    public function show(string $slug)
    {
        $playbook = DB::table('admiral.community_playbooks')
            ->where('slug', $slug)
            ->first();

        if (!$playbook) {
            return response()->json(['error' => 'Playbook not found'], 404);
        }

        // Decode manifest JSON
        $playbook->manifest = json_decode($playbook->manifest);

        return response()->json(['playbook' => $playbook]);
    }

    /**
     * Install community playbook to user's library
     */
    public function install(Request $request, string $slug)
    {
        $user = $request->user();

        // Fetch community playbook metadata
        $communityPlaybook = DB::table('admiral.community_playbooks')
            ->where('slug', $slug)
            ->first();

        if (!$communityPlaybook) {
            return response()->json(['error' => 'Playbook not found'], 404);
        }

        $manifest = json_decode($communityPlaybook->manifest, true);

        // Check if already installed
        $existing = DB::table('admiral.playbooks')
            ->where('user_id', $user->id)
            ->where('community_playbook_id', $communityPlaybook->id)
            ->first();

        if ($existing) {
            return response()->json([
                'error' => 'Playbook already installed',
                'playbook_id' => $existing->id,
            ], 409);
        }

        // Download files from GitHub
        $downloadPath = "/var/lib/nodepulse/playbooks/community/{$slug}/";
        $this->downloadPlaybookFiles($communityPlaybook, $manifest, $downloadPath);

        // Read main playbook content
        $playbookContent = file_get_contents($downloadPath . $manifest['entry_point']);

        // Insert into user's playbooks
        $playbookId = DB::table('admiral.playbooks')->insertGetId([
            'user_id' => $user->id,
            'name' => $manifest['name'],
            'description' => $manifest['description'] ?? null,
            'tags' => $manifest['tags'] ?? [],
            'content' => $playbookContent,
            'file_path' => $downloadPath,
            'playbook_entry_point' => $manifest['entry_point'],
            'is_package' => isset($manifest['structure']['templates']) || isset($manifest['structure']['files']),
            'community_playbook_id' => $communityPlaybook->id,
            'is_system' => false,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Increment install count
        DB::table('admiral.community_playbooks')
            ->where('id', $communityPlaybook->id)
            ->increment('install_count');

        return response()->json([
            'message' => 'Playbook installed successfully',
            'playbook_id' => $playbookId,
            'playbook' => [
                'id' => $playbookId,
                'name' => $manifest['name'],
                'file_path' => $downloadPath,
            ],
        ], 201);
    }

    /**
     * Download playbook files from GitHub
     */
    private function downloadPlaybookFiles($communityPlaybook, $manifest, $downloadPath)
    {
        // Create directory
        if (!is_dir($downloadPath)) {
            mkdir($downloadPath, 0755, true);
        }

        // Use jsDelivr CDN (free, unlimited bandwidth)
        $baseURL = sprintf(
            'https://cdn.jsdelivr.net/gh/%s@%s/%s',
            $communityPlaybook->github_repo,
            $communityPlaybook->github_branch,
            $communityPlaybook->github_path
        );

        // Download main playbook
        $this->downloadFile(
            $baseURL . $manifest['entry_point'],
            $downloadPath . $manifest['entry_point']
        );

        // Download templates
        if (isset($manifest['structure']['templates'])) {
            foreach ($manifest['structure']['templates'] as $template) {
                $localPath = $downloadPath . $template;
                $dir = dirname($localPath);

                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }

                $this->downloadFile($baseURL . $template, $localPath);
            }
        }

        // Download files
        if (isset($manifest['structure']['files'])) {
            foreach ($manifest['structure']['files'] as $file) {
                $localPath = $downloadPath . $file;
                $dir = dirname($localPath);

                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }

                $this->downloadFile($baseURL . $file, $localPath);
            }
        }
    }

    /**
     * Download single file
     */
    private function downloadFile(string $url, string $destination)
    {
        $response = Http::timeout(30)->get($url);

        if (!$response->successful()) {
            throw new \Exception("Failed to download {$url}: HTTP {$response->status()}");
        }

        file_put_contents($destination, $response->body());
    }
}
```

---

## Frontend Implementation

### 1. Community Playbooks List Page

**Route**: `/dashboard/playbooks/community`

**File**: `flagship/resources/js/pages/playbooks/community-index.tsx`

```typescript
import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Search, Filter, Download } from 'lucide-react';

interface CommunityPlaybook {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  author_name: string;
  install_count: number;
}

export default function CommunityPlaybooksIndex() {
  const [playbooks, setPlaybooks] = useState<CommunityPlaybook[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const categories = [
    'monitoring',
    'database',
    'search',
    'security',
    'proxy',
    'storage',
    'dev-tools',
  ];

  const fetchPlaybooks = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);

    const response = await fetch(`/api/community-playbooks?${params}`);
    const data = await response.json();
    setPlaybooks(data.playbooks);
  };

  const handleInstall = async (slug: string) => {
    try {
      const response = await fetch(`/api/community-playbooks/${slug}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        router.visit(`/dashboard/playbooks/${data.playbook_id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Installation failed');
      }
    } catch (err) {
      alert('Installation failed: ' + err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Community Playbooks</h1>
        <p className="mt-2 text-gray-600">
          Pre-built Ansible playbooks maintained by the community
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search playbooks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && fetchPlaybooks()}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <button
          onClick={fetchPlaybooks}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Playbooks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {playbooks.map((playbook) => (
          <div
            key={playbook.id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {playbook.name}
                </h3>
                <p className="text-sm text-gray-500">{playbook.version}</p>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                {playbook.category}
              </span>
            </div>

            <p className="text-gray-600 text-sm mb-4 line-clamp-3">
              {playbook.description}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {playbook.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Download className="w-4 h-4" />
                <span>{playbook.install_count} installs</span>
              </div>

              <button
                onClick={() => handleInstall(playbook.slug)}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                Install
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2. Playbook Detail Page

**Route**: `/dashboard/playbooks/community/{slug}`

**File**: `flagship/resources/js/pages/playbooks/community-show.tsx`

```typescript
import { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, Download, ExternalLink } from 'lucide-react';

interface PlaybookManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url?: string;
  };
  category: string;
  tags: string[];
  requirements: {
    ansible_version: string;
    os: string[];
    arch: string[];
  };
  variables?: Record<string, VariableSchema>;
  dangerous_operations?: string[];
  health_checks?: HealthCheck[];
}

interface VariableSchema {
  type: string;
  default?: any;
  description: string;
  required: boolean;
  secret?: boolean;
  min?: number;
  max?: number;
}

export default function CommunityPlaybookShow({ slug }: { slug: string }) {
  const [playbook, setPlaybook] = useState<any>(null);
  const [manifest, setManifest] = useState<PlaybookManifest | null>(null);
  const [acceptedWarnings, setAcceptedWarnings] = useState(false);

  useEffect(() => {
    fetch(`/api/community-playbooks/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        setPlaybook(data.playbook);
        setManifest(data.playbook.manifest);
      });
  }, [slug]);

  const handleInstall = async () => {
    if (manifest?.dangerous_operations?.length && !acceptedWarnings) {
      alert('Please accept the warnings before installing');
      return;
    }

    try {
      const response = await fetch(`/api/community-playbooks/${slug}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        router.visit(`/dashboard/playbooks/${data.playbook_id}`);
      }
    } catch (err) {
      alert('Installation failed');
    }
  };

  if (!playbook || !manifest) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{manifest.name}</h1>
              <p className="text-gray-600 mt-2">{manifest.description}</p>
            </div>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              v{manifest.version}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
            <span>by {manifest.author.name}</span>
            <span>•</span>
            <span className="capitalize">{manifest.category}</span>
            <span>•</span>
            <span>{playbook.install_count} installs</span>
          </div>
        </div>

        {/* Tags */}
        <div className="mb-6 flex flex-wrap gap-2">
          {manifest.tags.map((tag) => (
            <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-700 rounded">
              {tag}
            </span>
          ))}
        </div>

        {/* Requirements */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Requirements</h2>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-gray-500">Ansible Version</dt>
              <dd className="text-sm font-mono">{manifest.requirements.ansible_version}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Supported OS</dt>
              <dd className="text-sm">{manifest.requirements.os.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Architecture</dt>
              <dd className="text-sm">{manifest.requirements.arch.join(', ')}</dd>
            </div>
          </dl>
        </div>

        {/* Dangerous Operations Warning */}
        {manifest.dangerous_operations && manifest.dangerous_operations.length > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-2">
                  Warning: This playbook will perform the following operations
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                  {manifest.dangerous_operations.map((op, i) => (
                    <li key={i}>{op}</li>
                  ))}
                </ul>

                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedWarnings}
                    onChange={(e) => setAcceptedWarnings(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-yellow-900">
                    I understand and accept these operations
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Variables */}
        {manifest.variables && Object.keys(manifest.variables).length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Configuration Variables</h2>
            <div className="space-y-3">
              {Object.entries(manifest.variables).map(([key, schema]) => (
                <div key={key} className="border border-gray-200 rounded p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <code className="text-sm font-mono text-blue-600">{key}</code>
                      {schema.required && (
                        <span className="ml-2 text-xs text-red-600">required</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{schema.type}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{schema.description}</p>
                  {schema.default !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      Default: <code>{JSON.stringify(schema.default)}</code>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Install Button */}
        <div className="flex gap-4">
          <button
            onClick={handleInstall}
            disabled={manifest.dangerous_operations?.length > 0 && !acceptedWarnings}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Install Playbook
          </button>

          {manifest.author.url && (
            <a
              href={manifest.author.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## GitHub Repository Setup

### 1. CI Workflow (PR Validation)

**File**: `.github/workflows/validate-playbook.yml`

```yaml
name: Validate Playbook PR

on:
  pull_request:
    paths:
      - '[a-z]/**'
      - '!**.md'

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Ansible and ansible-lint
        run: |
          pip install ansible ansible-lint

      - name: Find changed playbooks
        id: changes
        run: |
          changed_dirs=$(git diff --name-only origin/main... | grep -E '^[a-z]/[^/]+/' | cut -d'/' -f1,2 | sort -u)
          echo "Changed directories: $changed_dirs"
          echo "dirs<<EOF" >> $GITHUB_OUTPUT
          echo "$changed_dirs" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Validate manifest.json exists
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            echo "Checking $dir..."

            if [ ! -f "$dir/manifest.json" ]; then
              echo "❌ Missing manifest.json in $dir"
              EXIT_CODE=1
            else
              echo "✅ Found manifest.json in $dir"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Validate JSON syntax
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            echo "Validating JSON syntax for $dir/manifest.json..."

            if ! jq empty "$dir/manifest.json" 2>&1; then
              echo "❌ Invalid JSON in $dir/manifest.json"
              EXIT_CODE=1
            else
              echo "✅ Valid JSON in $dir/manifest.json"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Validate required fields
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            echo "Validating required fields in $dir/manifest.json..."

            REQUIRED_FIELDS=("id" "name" "version" "description" "category" "entry_point")

            for field in "${REQUIRED_FIELDS[@]}"; do
              if ! jq -e ".$field" "$dir/manifest.json" > /dev/null 2>&1; then
                echo "❌ Missing required field '$field' in $dir/manifest.json"
                EXIT_CODE=1
              fi
            done

            # Validate ID matches directory name
            manifest_id=$(jq -r '.id' "$dir/manifest.json")
            dir_name=$(basename "$dir")

            if [ "$manifest_id" != "$dir_name" ]; then
              echo "❌ Manifest ID '$manifest_id' doesn't match directory name '$dir_name'"
              EXIT_CODE=1
            fi

          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Validate entry point exists
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            entry_point=$(jq -r '.entry_point' "$dir/manifest.json")

            if [ ! -f "$dir/$entry_point" ]; then
              echo "❌ Entry point '$entry_point' not found in $dir"
              EXIT_CODE=1
            else
              echo "✅ Entry point '$entry_point' exists in $dir"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Validate YAML syntax
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            entry_point=$(jq -r '.entry_point' "$dir/manifest.json")

            echo "Validating YAML syntax for $dir/$entry_point..."

            if ! ansible-playbook --syntax-check "$dir/$entry_point" 2>&1; then
              echo "❌ YAML syntax error in $dir/$entry_point"
              EXIT_CODE=1
            else
              echo "✅ Valid YAML syntax in $dir/$entry_point"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Run ansible-lint
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            entry_point=$(jq -r '.entry_point' "$dir/manifest.json")

            echo "Running ansible-lint on $dir/$entry_point..."

            if ! ansible-lint "$dir/$entry_point" 2>&1; then
              echo "⚠️  ansible-lint warnings/errors in $dir/$entry_point"
              # Don't fail on lint warnings, just show them
            else
              echo "✅ No ansible-lint issues in $dir/$entry_point"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          # Don't fail build on lint warnings
          exit 0

      - name: Validate category
        run: |
          EXIT_CODE=0
          VALID_CATEGORIES=("monitoring" "database" "search" "security" "proxy" "storage" "dev-tools")

          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            category=$(jq -r '.category' "$dir/manifest.json")

            if [[ ! " ${VALID_CATEGORIES[@]} " =~ " ${category} " ]]; then
              echo "❌ Invalid category '$category' in $dir/manifest.json"
              echo "   Valid categories: ${VALID_CATEGORIES[@]}"
              EXIT_CODE=1
            else
              echo "✅ Valid category '$category' in $dir/manifest.json"
            fi
          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Validate zero external dependencies (self-contained)
        run: |
          EXIT_CODE=0
          while IFS= read -r dir; do
            if [ -z "$dir" ]; then continue; fi

            echo "Checking $dir for external dependencies..."

            # Check for requirements.yml (Ansible Galaxy automatic fetching)
            if [ -f "$dir/requirements.yml" ]; then
              echo "❌ Found requirements.yml in $dir"
              echo "   Playbooks must not use external dependency fetching."
              echo "   If you need Galaxy role code, copy it into your playbook directory (e.g., roles/)."
              EXIT_CODE=1
            fi

            # Check for meta/main.yml with external dependencies
            if [ -f "$dir/meta/main.yml" ]; then
              # Parse and check for external dependencies (roles not in local directory)
              if grep -q "dependencies:" "$dir/meta/main.yml" 2>/dev/null; then
                # Check if dependencies reference external roles (namespace.role format)
                if grep -qE "dependencies:.*[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+" "$dir/meta/main.yml" 2>/dev/null; then
                  echo "❌ External role dependencies found in meta/main.yml"
                  echo "   Copy external role code into your playbook directory instead."
                  EXIT_CODE=1
                fi
              fi
            fi

            # Check playbook content for external collection requirements
            entry_point=$(jq -r '.entry_point' "$dir/manifest.json")

            if grep -q "collections:" "$dir/$entry_point" 2>/dev/null; then
              echo "⚠️  Collections declaration found in $dir/$entry_point"
              echo "   Ensure collection code is included in your playbook directory (not fetched externally)."
              # Don't fail - collections might be included locally
            fi

            if [ $EXIT_CODE -eq 0 ]; then
              echo "✅ Playbook $dir has zero external dependencies"
            fi

          done <<< "${{ steps.changes.outputs.dirs }}"

          exit $EXIT_CODE

      - name: Summary
        if: always()
        run: |
          echo "### Validation Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Changed playbooks:" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          echo "${{ steps.changes.outputs.dirs }}" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
```

### 2. Contribution Guide

**File**: `CONTRIBUTING.md`

```markdown
# Contributing to Node Pulse Playbooks

Thank you for contributing to the community playbook repository!

## Quick Start

1. **Fork this repository**
2. **Create a playbook directory**: `{first-letter}/{playbook-name}/`
3. **Add required files**:
   - `manifest.json` (required)
   - `playbook.yml` (or custom entry point)
   - `templates/` (optional)
   - `files/` (optional)
   - `README.md` (optional)

## Directory Structure

```
m/meilisearch/
├── manifest.json       # Required metadata
├── playbook.yml        # Ansible playbook (entry point)
├── templates/          # Optional Jinja2 templates
│   └── config.j2
├── files/              # Optional static files
│   └── healthcheck.sh
└── README.md           # Optional documentation
```

## Manifest Schema

Every playbook **must** include a `manifest.json` file:

```json
{
  "id": "meilisearch",
  "name": "Meilisearch Single Node",
  "version": "1.0.0",
  "description": "Deploy Meilisearch search engine with systemd service",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://github.com/yourname"
  },
  "category": "search",
  "tags": ["search", "database", "api"],
  "entry_point": "playbook.yml",
  "structure": {
    "playbook": "playbook.yml",
    "templates": ["templates/config.j2"],
    "files": ["files/healthcheck.sh"]
  },
  "requirements": {
    "ansible_version": ">=2.15",
    "os": ["ubuntu-20.04", "ubuntu-22.04", "debian-11", "debian-12"],
    "arch": ["amd64", "arm64"]
  },
  "variables": {
    "port": {
      "type": "integer",
      "default": 7700,
      "description": "HTTP listen port",
      "required": false
    }
  },
  "health_checks": [
    {
      "type": "http",
      "url": "http://127.0.0.1:{{ port }}/health",
      "expect_status": 200
    }
  ],
  "dangerous_operations": [
    "Opens firewall port {{ port }}",
    "Creates systemd service 'meilisearch'"
  ],
  "license": "MIT"
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (must match directory name) |
| `name` | string | Display name |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `description` | string | Short description (max 200 chars) |
| `author` | object | Author information |
| `category` | string | One of: `monitoring`, `database`, `search`, `security`, `proxy`, `storage`, `dev-tools` |
| `tags` | string[] | Searchable tags (max 10) |
| `entry_point` | string | Main playbook file (e.g., "playbook.yml") |
| `requirements` | object | System requirements |
| `license` | string | SPDX license identifier |

### Optional Fields

- `structure` - File manifest (helps Admiral know what to download)
- `variables` - Variable schema for auto-generating configuration forms
- `health_checks` - Post-install health check definitions
- `dangerous_operations` - Warning messages for risky operations

## Validation Checklist

Before submitting a PR, ensure:

- [ ] `manifest.json` exists and is valid JSON
- [ ] All required fields are present
- [ ] `id` matches directory name
- [ ] Entry point file exists
- [ ] YAML passes syntax check: `ansible-playbook --syntax-check playbook.yml`
- [ ] Playbook passes ansible-lint (warnings acceptable)
- [ ] Category is valid
- [ ] Version follows semantic versioning
- [ ] **No `requirements.yml` file** (we don't fetch external dependencies)
- [ ] **No external role/collection references** in `meta/main.yml` (copy code locally instead)
- [ ] All templates, files, roles, and collections are in the playbook directory
- [ ] If using Galaxy code, it's copied locally and credited in README

### Run Validation Locally

```bash
# Validate JSON
jq empty m/your-app/manifest.json

# Check YAML syntax
ansible-playbook --syntax-check m/your-app/playbook.yml

# Run linter
ansible-lint m/your-app/playbook.yml

# Check for external dependencies (must return nothing)
find m/your-app -name "requirements.yml"
grep -r "collections:" m/your-app/playbook.yml
grep -rE "role:\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+" m/your-app/playbook.yml
```

## Playbook Best Practices

1. **Self-Contained** - **CRITICAL**: No external dependency fetching. All code must be in your playbook directory. You can use Galaxy role/collection code, but copy it locally into `roles/` or `library/` directories. No `requirements.yml` files.
2. **Idempotency** - Playbooks should be safe to run multiple times
3. **Error Handling** - Use `failed_when` and `changed_when` appropriately
4. **Variables** - Use sensible defaults, document all variables
5. **Templates** - Use Jinja2 templates for configuration files
6. **Security** - Never hardcode secrets, use variables marked as `secret: true`
7. **Health Checks** - Include verification tasks
8. **Documentation** - Add `README.md` with usage examples and credit any Galaxy roles you've copied

## Example Playbook

See `m/meilisearch/` for a complete example.

## Submission Process

1. Create a fork of this repository
2. Create your playbook directory
3. Add `manifest.json` and playbook files
4. Test locally with Ansible
5. Submit a pull request
6. CI will validate your submission
7. Maintainers will review and merge

## Questions?

Open an issue or reach out to the maintainers.

---

**License**: All contributions must be MIT licensed.
```

### 3. Repository README

**File**: `README.md`

```markdown
# Node Pulse Community Playbooks

A curated collection of Ansible playbooks for deploying common services to Linux servers.

## Browse Playbooks

Browse all available playbooks in your Admiral dashboard: **Playbooks → Community**

Or explore this repository by category:

- [Monitoring](./m/) - node_exporter, process_exporter, blackbox_exporter
- [Database](./d/) - PostgreSQL, MySQL, MongoDB, Valkey
- [Search](./s/) - Meilisearch, Elasticsearch
- [Security](./s/) - Fail2ban, SSH hardening, Wazuh
- [Proxy](./p/) - Caddy, Nginx
- [Storage](./s/) - SeaweedFS, MinIO
- [Dev Tools](./d/) - Docker, Git, build tools

## Quick Start

### Install a Playbook

1. Open your Admiral dashboard
2. Go to **Playbooks → Community**
3. Search for a playbook (e.g., "Meilisearch")
4. Click **Install**
5. Configure variables (if any)
6. Execute on your servers

### Contribute a Playbook

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed instructions.

Quick steps:

```bash
# 1. Fork this repository

# 2. Create playbook directory
mkdir -p m/my-app

# 3. Add manifest.json
cat > m/my-app/manifest.json <<EOF
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "Deploy My App",
  "author": {"name": "Your Name"},
  "category": "dev-tools",
  "tags": ["app"],
  "entry_point": "playbook.yml",
  "requirements": {
    "ansible_version": ">=2.15",
    "os": ["ubuntu-22.04"]
  },
  "license": "MIT"
}
EOF

# 4. Create playbook
cat > m/my-app/playbook.yml <<EOF
---
- name: Deploy My App
  hosts: all
  tasks:
    - name: Hello World
      debug:
        msg: "Hello from My App!"
EOF

# 5. Validate
ansible-playbook --syntax-check m/my-app/playbook.yml

# 6. Submit PR
```

## License

MIT - See [LICENSE](./LICENSE) for details

## Maintained By

[Node Pulse Community](https://github.com/node-pulse)
```

---

## Implementation Roadmap

### Phase 1: Backend Infrastructure (Week 1)

**Submarines (Go)**:
- [ ] Create `admiral.community_playbooks` table migration
- [ ] Implement sync job (`sync_community_playbooks.go`)
- [ ] Add cron schedule (every 6 hours)
- [ ] Test sync against sample GitHub repo
- [ ] Add logging and error handling

**Testing**:
- [ ] Create sample playbook in test repo
- [ ] Verify sync populates database correctly
- [ ] Test manifest validation logic
- [ ] Test error handling for invalid manifests

### Phase 2: API Endpoints (Week 1-2)

**Flagship (Laravel)**:
- [ ] Create `CommunityPlaybookController`
- [ ] Implement `GET /api/community-playbooks` (list)
- [ ] Implement `GET /api/community-playbooks/{slug}` (show)
- [ ] Implement `POST /api/community-playbooks/{slug}/install`
- [ ] Add file download utility (from jsDelivr CDN)
- [ ] Update `admiral.playbooks` table with `community_playbook_id` column

**Testing**:
- [ ] Test listing with filters (category, tags, search)
- [ ] Test pagination
- [ ] Test installation flow
- [ ] Test file download from GitHub/jsDelivr
- [ ] Test duplicate installation handling

### Phase 3: Frontend UI (Week 2)

**Flagship (React/Inertia)**:
- [ ] Create community playbooks list page (`/dashboard/playbooks/community`)
- [ ] Add search and filter UI
- [ ] Create playbook detail page (`/dashboard/playbooks/community/{slug}`)
- [ ] Implement install flow with variable configuration
- [ ] Add dangerous operations warning modal
- [ ] Update navigation to include "Community" tab

**Testing**:
- [ ] Test responsive design
- [ ] Test search functionality
- [ ] Test install flow end-to-end
- [ ] Test error handling and user feedback

### Phase 4: GitHub Repository Setup (Week 2-3)

**GitHub**:
- [ ] Create `github.com/node-pulse/playbooks` repository
- [ ] Set up CI workflow (`.github/workflows/validate-playbook.yml`)
- [ ] Create `CONTRIBUTING.md`
- [ ] Create `README.md`
- [ ] Add initial playbooks:
  - [ ] `n/node-exporter`
  - [ ] `m/meilisearch`
  - [ ] `v/valkey`
  - [ ] `c/caddy`
  - [ ] `f/fail2ban`

**Testing**:
- [ ] Submit test PR with invalid manifest (should fail CI)
- [ ] Submit test PR with valid playbook (should pass CI)
- [ ] Test CI validation for all checks

### Phase 5: Integration Testing (Week 3)

**End-to-End**:
- [ ] Install Admiral locally
- [ ] Trigger sync job manually
- [ ] Browse community playbooks in UI
- [ ] Install a playbook (e.g., Meilisearch)
- [ ] Execute installed playbook on test server
- [ ] Verify playbook execution succeeds
- [ ] Test uninstall/cleanup

**Performance**:
- [ ] Benchmark sync job with 100+ playbooks
- [ ] Test search performance with large dataset
- [ ] Optimize database queries if needed

### Phase 6: Documentation & Launch (Week 4)

**Documentation**:
- [ ] Update user guide with community playbooks section
- [ ] Create video tutorial for installing playbooks
- [ ] Create video tutorial for contributing playbooks
- [ ] Add FAQ section

**Launch**:
- [ ] Announce feature in release notes
- [ ] Post on GitHub/social media
- [ ] Invite community contributions
- [ ] Monitor for issues and iterate

---

## Success Metrics

### Launch Metrics (First 3 Months)

- **Repository Growth**: 20+ community-contributed playbooks
- **Adoption**: 40% of Admiral users install at least 1 community playbook
- **Contributions**: 10+ unique contributors
- **Sync Reliability**: >99% successful syncs

### Quality Metrics

- **CI Pass Rate**: >90% of PRs pass validation on first submission
- **Installation Success**: >95% of installations succeed
- **Sync Performance**: <30 seconds to sync 100 playbooks
- **Search Performance**: <200ms for search queries

---

## Security Considerations

### Trust Model

**Playbook Trust**:
- ✅ All playbooks reviewed by maintainers before merge
- ✅ CI validates syntax and structure
- ✅ Dangerous operations clearly disclosed
- ✅ Users must accept warnings before installation

**No PGP Signing** (Phase 1):
- Trust GitHub's security model
- Trust maintainer code review process
- Future: Add optional PGP signing (Phase 3+)

### Execution Security

**Sandboxing**:
- Playbooks run in same context as user-uploaded playbooks
- No additional sandboxing in Phase 1
- Future: Ansible check mode dry-run validation (Phase 3)

**User Isolation**:
- Each user's installed playbooks are private
- Community playbooks are read-only templates
- Installed copies are independent

### Network Security

**CDN Usage**:
- Use jsDelivr CDN (free, unlimited bandwidth)
- Fallback to raw.githubusercontent.com if CDN fails
- All downloads over HTTPS

---

## FAQ

### Q: How are playbooks verified before being added?
**A**: All playbooks go through PR review by maintainers. CI validates syntax, structure, and required fields. Maintainers review code for security issues.

### Q: Can I trust community playbooks?
**A**: Community playbooks are reviewed by maintainers, but users should always review playbook code before installation. Dangerous operations are clearly disclosed.

### Q: How often are playbooks synced from GitHub?
**A**: Admiral syncs every 6 hours. You can also trigger a manual sync from settings.

### Q: Can I modify installed playbooks?
**A**: Yes! Once installed, playbooks become part of your library and can be edited like any user-uploaded playbook.

### Q: What if a playbook stops working?
**A**: Report issues on the GitHub repository. Maintainers will review and update playbooks as needed. You can also fork and modify playbooks yourself.

### Q: How do I update an installed playbook?
**A**: Reinstall the playbook from the community repository (Phase 1). Automatic update notifications coming in Phase 3.

### Q: Can I submit proprietary/commercial playbooks?
**A**: No, all playbooks must be MIT licensed and open source.

### Q: What happens if GitHub is down?
**A**: You can still execute installed playbooks. Browsing/installing new playbooks requires GitHub access.

### Q: Can I use Ansible Galaxy roles or collections in my playbook?
**A**: Yes, but you must explicitly make a local copy and include it in your playbook directory. We do not fetch anything from external sources - only files from this GitHub repository are downloaded. This means:
- Copy the role/collection code directly into your playbook directory (e.g., `roles/` or `library/`)
- Include all necessary files in your `manifest.json` structure
- Ensure all code is part of your playbook package
- No `requirements.yml` files (we don't run `ansible-galaxy install`)

This approach ensures reliability (no broken external dependencies), security (all code is reviewed), and offline capability while still letting you leverage existing Ansible code.

**Benefits for Community Sharing:**
- **Easy to grab and go** - Download one directory, run one playbook
- **Easy to understand** - Everything needed is right there
- **Easy to modify** - Users can customize without breaking other playbooks
- **Easy to contribute** - No need to coordinate dependencies with other contributors
- **Easy to maintain** - Each playbook owner manages only their own code

---

## Future Enhancements (Phase 3+)

1. **Automatic Updates**
   - Notify users when installed playbooks have updates
   - One-click update to latest version
   - Version pinning

2. **Advanced Search**
   - Filter by OS, architecture
   - Sort by popularity, recent updates
   - Related playbooks recommendations

3. **Playbook Dependencies**
   - Express dependencies between playbooks
   - Automatic dependency installation
   - Conflict detection

4. **Community Features**
   - Star/favorite playbooks
   - Usage statistics
   - User comments/reviews

5. **PGP Signing**
   - Optional playbook signing
   - Trusted publisher verification
   - Signature verification on install

6. **Multi-Repository Support**
   - Add custom playbook repositories
   - Private/enterprise repositories
   - Repository prioritization

---

## References

- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/tips_tricks/ansible_tips_tricks.html)
- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [jsDelivr CDN](https://www.jsdelivr.com/)

---

**Document Status**: Complete
**Next Review**: After Phase 2.5 implementation begins
**Owner**: Engineering Team

# Custom Playbook Upload Feature Specification

**Status**: Planned (Phase 2.1 - Tier 2)
**Target**: Post-MVP
**Created**: 2025-11-01

---

## Overview

This feature enables users to upload custom Ansible playbooks through the Flagship web UI. It provides a middle-ground between system-provided playbooks (Tier 1) and a full web-based YAML editor (Tier 3).

Users can upload either:
1. **Simple playbooks** - Single `.yml` file with inline tasks
2. **Playbook packages** - ZIP archive containing playbook + templates + files

### Goals

1. **Enable customization** - Users can run their own automation tasks beyond built-in playbooks
2. **Maintain simplicity** - Upload via web form, no Git integration required
3. **Ensure safety** - Basic validation prevents syntax errors
4. **Support backup** - Users can export/download their playbooks anytime
5. **Support templates** - Allow template files for configuration management

### Non-Goals

- Advanced YAML editor with syntax highlighting (Tier 3)
- Full Ansible role support with complex directory structures (Phase 3+)
- Git integration (Phase 5)
- Complex validation/sandboxing (users are trusted)

---

## User Stories

### Primary Use Cases

**Story 1: DevOps Engineer - Custom Deployment Script**
> "As a DevOps engineer, I want to upload my custom application deployment playbook so that I can automate deployments to my servers without manually SSH-ing into each one."

**Story 2: System Administrator - Backup Script**
> "As a sysadmin, I want to upload a backup playbook that runs nightly across all my servers and stores backups to S3."

**Story 3: Security Analyst - Compliance Audit**
> "As a security analyst, I want to run my custom compliance check playbook monthly and export the results for audit purposes."

**Story 4: Freelancer - Client-Specific Tasks**
> "As a freelancer managing multiple clients, I want to upload client-specific maintenance playbooks and organize them by tags."

---

## Architecture

### Storage Strategy: Hybrid (Database + Filesystem)

**Why Hybrid?**

1. **Database (PostgreSQL)** - Stores playbook content as text for backup, versioning, and search
2. **Filesystem** - Ansible execution requires actual files on disk
3. **Best of both** - Database backup + fast execution

```
┌─────────────────────────────────────────────────┐
│  User uploads playbook via Web UI              │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Flagship validates YAML syntax                 │
│  - Parse YAML structure                         │
│  - Check for required Ansible keys              │
│  - Basic security scan (no hardcoded secrets)   │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
┌───────────────┐   ┌────────────────────┐
│  PostgreSQL   │   │  Filesystem        │
│  admiral.     │   │  /var/lib/         │
│  playbooks    │   │  nodepulse/        │
│               │   │  playbooks/        │
│  - id         │   │  user_123/         │
│  - user_id    │   │    custom.yml      │
│  - name       │   │                    │
│  - content    │◄──┤  Symlinked to      │
│  - file_path  │   │  real file         │
│  - version    │   │                    │
└───────────────┘   └────────────────────┘
        │
        │ Backup/Export
        ▼
┌─────────────────────────────────────────────────┐
│  Download ZIP: all_playbooks.zip                │
│  - user_playbook_1.yml                          │
│  - user_playbook_2.yml                          │
│  - metadata.json                                │
└─────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `admiral.playbooks`

```sql
CREATE TABLE admiral.playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    user_id BIGINT NOT NULL REFERENCES admiral.users(id) ON DELETE CASCADE,

    -- Playbook metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tags TEXT[],  -- For categorization: ["backup", "security", "client-abc"]

    -- Upload type
    is_package BOOLEAN DEFAULT false,  -- True if ZIP upload (has templates/files)

    -- Content storage (for backup/versioning)
    content TEXT NOT NULL,  -- Full YAML content (main playbook.yml)

    -- Filesystem location
    file_path TEXT NOT NULL,  -- Simple: "/path/to/playbook.yml" | Package: "/path/to/package-dir/"
    playbook_entry_point TEXT,  -- For packages: relative path to main playbook (e.g., "playbook.yml")

    -- Versioning
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES admiral.playbooks(id),  -- Points to previous version

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,  -- True for built-in playbooks

    -- Validation
    last_validated_at TIMESTAMPTZ,
    validation_errors JSONB,  -- Store validation warnings/errors

    -- Usage stats
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id, name, version),
    CHECK(length(name) >= 3),
    CHECK(length(content) >= 10)
);

-- Indexes
CREATE INDEX idx_playbooks_user ON admiral.playbooks(user_id, is_active);
CREATE INDEX idx_playbooks_tags ON admiral.playbooks USING GIN(tags);
CREATE INDEX idx_playbooks_created ON admiral.playbooks(created_at DESC);
CREATE INDEX idx_playbooks_name_search ON admiral.playbooks USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- View for active playbooks only
CREATE VIEW admiral.active_playbooks AS
SELECT * FROM admiral.playbooks
WHERE is_active = true;
```

### Filesystem Structure

```
/var/lib/nodepulse/playbooks/
├── system/                           # Built-in playbooks (is_system=true)
│   ├── deploy-agent-mtls.yml
│   ├── deploy-node-exporter.yml
│   └── security-hardening.yml
│
├── user_1/                           # User-uploaded playbooks
│   ├── custom-backup.yml             # Simple playbook (single file)
│   ├── deploy-app.yml                # Simple playbook
│   │
│   ├── nginx-setup/                  # Playbook package (extracted ZIP)
│   │   ├── playbook.yml              # Main playbook
│   │   ├── templates/
│   │   │   ├── nginx.conf.j2
│   │   │   └── site.conf.j2
│   │   └── files/
│   │       └── index.html
│   │
│   └── wordpress-deploy/             # Another playbook package
│       ├── playbook.yml
│       ├── templates/
│       │   └── wp-config.php.j2
│       └── files/
│           └── .htaccess
│
├── user_2/
│   ├── client-a-maintenance.yml
│   └── client-b-deploy.yml
│
└── shared/                           # Future: shared playbooks (Phase 3)
    └── community-wordpress-setup.yml
```

---

## Validation Rules

### Basic Validation (Phase 1)

**File Upload Validation**
- Simple playbook: `.yml` or `.yaml` file only
- Package: `.zip` file containing valid structure
- Max file size: 1MB (simple) or 5MB (package)

**YAML Syntax Check**
- Must be valid YAML (no parse errors)
- Required top-level keys: `name`, `hosts`, `tasks` (or `roles`)
- No empty task lists

**Package Structure Validation** (for ZIP uploads)
- Must contain a main playbook file (e.g., `playbook.yml`)
- Optional: `templates/` directory for Jinja2 templates
- Optional: `files/` directory for static files
- No executable files allowed (.sh, .bin, .exe)
- Total extracted size must not exceed 10MB

**Ansible Structure Check**
```python
# Pseudo-code validation
def validate_playbook(yaml_content, package_files=None):
    # 1. Parse YAML
    try:
        data = yaml.safe_load(yaml_content)
    except YAMLError as e:
        return {"valid": False, "error": f"YAML syntax error: {e}"}

    # 2. Must be a list of plays
    if not isinstance(data, list):
        return {"valid": False, "error": "Playbook must be a list of plays"}

    # 3. Each play must have required keys
    for play in data:
        if "hosts" not in play:
            return {"valid": False, "error": "Each play must have 'hosts' key"}

        if "tasks" not in play and "roles" not in play:
            return {"valid": False, "error": "Each play must have 'tasks' or 'roles'"}

    # 4. Validate template references (for packages)
    if package_files:
        template_refs = extract_template_references(yaml_content)
        for ref in template_refs:
            if ref not in package_files:
                return {
                    "valid": False,
                    "error": f"Referenced template not found in package: {ref}"
                }

    # 5. Scan for hardcoded secrets (basic regex check)
    secrets_found = scan_for_secrets(yaml_content)
    if secrets_found:
        return {
            "valid": True,
            "warnings": [f"Potential secret found: {s}" for s in secrets_found]
        }

    return {"valid": True}
```

**Basic Secret Detection**
```regex
# Warn if these patterns are found (not blocking, just warnings)
password:\s*['"]\w+['"]
api_key:\s*['"]\w+['"]
secret:\s*['"]\w+['"]
token:\s*['"]\w+['"]
```

### Future: Advanced Validation (Optional - Phase 3)

- Module whitelist (only allow safe modules)
- Variable validation (ensure all variables are defined)
- Dry-run execution in sandbox
- Ansible-lint integration

---

## API Endpoints

### Playbook Management API

**Base path**: `/api/playbooks`

#### List User Playbooks

```http
GET /api/playbooks
Authorization: Bearer {token}

Query Parameters:
  - tags: string[] (filter by tags)
  - search: string (search name/description)
  - is_active: boolean (default: true)
  - per_page: integer (default: 20)

Response: 200 OK
{
  "playbooks": [
    {
      "id": "uuid",
      "name": "Custom Backup Playbook",
      "description": "Backs up /var/www to S3",
      "tags": ["backup", "production"],
      "version": 2,
      "is_active": true,
      "execution_count": 15,
      "last_executed_at": "2025-11-01T10:30:00Z",
      "created_at": "2025-10-15T08:00:00Z",
      "updated_at": "2025-10-20T14:30:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 20,
    "total": 5
  }
}
```

#### Get Playbook Details

```http
GET /api/playbooks/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "playbook": {
    "id": "uuid",
    "name": "Custom Backup Playbook",
    "description": "Backs up /var/www to S3",
    "tags": ["backup", "production"],
    "content": "---\n- name: Backup to S3\n  hosts: all\n  tasks:\n    - name: ...",
    "file_path": "/var/lib/nodepulse/playbooks/user_123/custom-backup.yml",
    "version": 2,
    "parent_id": "previous-version-uuid",
    "validation_errors": null,
    "execution_count": 15,
    "last_executed_at": "2025-11-01T10:30:00Z",
    "created_at": "2025-10-15T08:00:00Z"
  }
}
```

#### Upload New Playbook

```http
POST /api/playbooks
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  - file: playbook.yml OR package.zip (required)
  - name: string (optional - auto-detected from playbook)
  - description: string (optional)
  - tags: string[] (optional)
  - entry_point: string (optional - for packages, defaults to "playbook.yml")

Response: 201 Created (Simple Playbook)
{
  "message": "Playbook uploaded successfully",
  "playbook": {
    "id": "new-uuid",
    "name": "Custom Backup Playbook",
    "is_package": false,
    "file_path": "/var/lib/nodepulse/playbooks/user_123/custom-backup.yml"
  },
  "validation": {
    "valid": true,
    "warnings": []
  }
}

Response: 201 Created (Package)
{
  "message": "Playbook package uploaded successfully",
  "playbook": {
    "id": "new-uuid",
    "name": "Nginx Setup",
    "is_package": true,
    "file_path": "/var/lib/nodepulse/playbooks/user_123/nginx-setup/",
    "playbook_entry_point": "playbook.yml",
    "package_contents": {
      "playbook": "playbook.yml",
      "templates": ["nginx.conf.j2", "site.conf.j2"],
      "files": ["index.html"]
    }
  },
  "validation": {
    "valid": true,
    "warnings": []
  }
}

Response: 400 Bad Request (validation failed)
{
  "message": "Playbook validation failed",
  "errors": [
    "YAML syntax error: expected <block end>, but found ..."
  ]
}
```

#### Update Playbook (Creates New Version)

```http
PUT /api/playbooks/{id}
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  - file: playbook.yml (optional - if provided, creates new version)
  - name: string (optional)
  - description: string (optional)
  - tags: string[] (optional)

Response: 200 OK
{
  "message": "Playbook updated (version 3 created)",
  "playbook": {
    "id": "new-version-uuid",
    "version": 3,
    "parent_id": "old-version-uuid"
  }
}
```

#### Delete Playbook (Soft Delete)

```http
DELETE /api/playbooks/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Playbook deactivated"
}
```

#### Export All Playbooks (Backup)

```http
GET /api/playbooks/export
Authorization: Bearer {token}

Response: 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="playbooks_backup_2025-11-01.zip"

ZIP Contents:
  playbooks/
    custom-backup.yml
    deploy-app.yml
    client-maintenance.yml
  metadata.json  # Contains names, descriptions, tags, versions
```

#### Import Playbooks (Restore)

```http
POST /api/playbooks/import
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  - file: playbooks_backup.zip

Response: 200 OK
{
  "message": "Imported 3 playbooks",
  "imported": [
    {"name": "custom-backup.yml", "status": "success"},
    {"name": "deploy-app.yml", "status": "success"},
    {"name": "invalid.yml", "status": "failed", "error": "YAML syntax error"}
  ]
}
```

---

## Web UI Components

### Playbook Upload Page

**Route**: `/dashboard/playbooks/upload`

**UI Components**:

1. **Upload Type Selector**
   - Radio buttons: "Simple Playbook" or "Playbook Package"
   - Shows appropriate instructions for each type

2. **File Upload Area**
   - Drag-and-drop zone
   - File picker button
   - Simple mode: Accepts `.yml`, `.yaml` files (max 1MB)
   - Package mode: Accepts `.zip` files (max 5MB)

3. **Package Configuration** (shown only for ZIP uploads)
   - Entry point selector (dropdown of .yml files found in ZIP)
   - Package contents preview (tree view of extracted files)

4. **Metadata Form**
   - Name (auto-filled from playbook, editable)
   - Description (optional textarea)
   - Tags (multi-select dropdown + custom input)

5. **Validation Preview**
   - Real-time YAML validation
   - Syntax highlighting (read-only preview)
   - Package structure validation (for ZIPs)
   - Warning/error messages

6. **Upload Button**
   - Disabled until validation passes
   - Shows progress indicator
   - Success/error toast notifications

**Example React Component Structure**:

```typescript
// flagship/resources/js/components/playbooks/upload-playbook.tsx
import { useState } from 'react';
import { useForm } from '@inertiajs/react';

interface UploadPlaybookForm {
  file: File | null;
  name: string;
  description: string;
  tags: string[];
}

export default function UploadPlaybook() {
  const { data, setData, post, processing, errors } = useForm<UploadPlaybookForm>({
    file: null,
    name: '',
    description: '',
    tags: [],
  });

  const [validationResult, setValidationResult] = useState(null);

  const handleFileChange = async (file: File) => {
    setData('file', file);

    // Auto-fill name from filename
    const name = file.name.replace(/\.(yml|yaml)$/, '');
    setData('name', name);

    // Validate YAML client-side
    const content = await file.text();
    const result = await validatePlaybook(content);
    setValidationResult(result);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    post('/api/playbooks', {
      forceFormData: true,
      onSuccess: () => {
        // Redirect to playbooks list
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <FileDropzone
        onFileSelect={handleFileChange}
        accept=".yml,.yaml"
        maxSize={1024 * 1024} // 1MB
      />

      {validationResult && (
        <ValidationPreview result={validationResult} />
      )}

      <Input
        label="Playbook Name"
        value={data.name}
        onChange={(e) => setData('name', e.target.value)}
        error={errors.name}
      />

      <Textarea
        label="Description"
        value={data.description}
        onChange={(e) => setData('description', e.target.value)}
      />

      <TagInput
        value={data.tags}
        onChange={(tags) => setData('tags', tags)}
      />

      <Button
        type="submit"
        disabled={processing || !validationResult?.valid}
      >
        Upload Playbook
      </Button>
    </form>
  );
}
```

### Playbook List Page

**Route**: `/dashboard/playbooks`

**Features**:
- Table view with columns: Name, Tags, Last Executed, Executions, Actions
- Filter by tags
- Search by name/description
- Quick actions: View, Edit, Execute, Delete, Download

### Playbook Detail Page

**Route**: `/dashboard/playbooks/{id}`

**Sections**:
1. **Metadata** - Name, description, tags, created date
2. **Content Preview** - Syntax-highlighted YAML (read-only)
3. **Version History** - List of all versions with diff view
4. **Execution History** - Recent runs with status
5. **Actions** - Execute, Edit, Download, Delete

---

## Implementation Plan

### Phase 1: Basic Upload (Week 1-2)

**Backend (Laravel/PostgreSQL)**:
- [ ] Create migration for `admiral.playbooks` table
- [ ] Create `Playbook` Eloquent model
- [ ] Implement `PlaybookService` for validation and storage
- [ ] Create API endpoints: `POST /api/playbooks`, `GET /api/playbooks`
- [ ] Write unit tests for validation logic

**Frontend (React/Inertia)**:
- [ ] Build upload form component
- [ ] Implement file dropzone with validation
- [ ] Create playbook list view
- [ ] Add toast notifications for success/errors

**Testing**:
- [ ] Test YAML validation with valid/invalid playbooks
- [ ] Test file upload with various file sizes
- [ ] Test database storage and filesystem sync

### Phase 2: Execution Integration (Week 3)

**Backend**:
- [ ] Update `AnsibleService` to support custom playbooks
- [ ] Modify `DeployAgentJob` to accept custom playbook IDs
- [ ] Add playbook selection to deployment creation API

**Frontend**:
- [ ] Add "Execute Playbook" button to playbook detail page
- [ ] Create server selection modal for custom playbooks
- [ ] Integrate with existing deployment flow

### Phase 3: Versioning & Backup (Week 4)

**Backend**:
- [ ] Implement versioning logic (create new version on update)
- [ ] Build export endpoint (`GET /api/playbooks/export`)
- [ ] Build import endpoint (`POST /api/playbooks/import`)
- [ ] Add diff comparison between versions

**Frontend**:
- [ ] Add version history view
- [ ] Build diff viewer component
- [ ] Add export/import buttons to playbook list
- [ ] Implement backup download functionality

### Phase 4: Polish & Documentation (Week 5)

**Backend**:
- [ ] Add usage statistics tracking
- [ ] Implement soft delete (is_active flag)
- [ ] Add tags filtering and search

**Frontend**:
- [ ] Improve UI/UX based on testing
- [ ] Add loading states and error handling
- [ ] Create help documentation in-app

**Documentation**:
- [ ] Update user guide with playbook upload instructions
- [ ] Create video tutorial for playbook upload
- [ ] Add example playbooks to documentation

---

## Security Considerations

### Basic Security (Phase 1)

1. **File Upload**
   - Restrict file types: `.yml`, `.yaml` only
   - Max file size: 1MB
   - Virus scan (optional with ClamAV)

2. **User Isolation**
   - Users can only access their own playbooks
   - File paths use user ID for separation
   - Database queries always filter by `user_id`

3. **Secret Detection**
   - Warn (don't block) if potential secrets detected
   - Encourage use of Ansible Vault or environment variables

4. **Execution**
   - Playbooks run in same context as system playbooks
   - No additional sandboxing (users are trusted)

### Future Security (Phase 3 - Optional)

1. **Module Whitelisting**
   - Restrict to safe Ansible modules only
   - Block: `shell`, `command`, `script`, `raw` modules
   - Allow: `apt`, `yum`, `systemd`, `file`, `template`, etc.

2. **Dry-Run Validation**
   - Test playbook execution in isolated environment
   - Use Docker container or Ansible check mode
   - Report potential issues before real execution

3. **Audit Logging**
   - Log all playbook uploads with user info
   - Track all executions with full output
   - Retention policy for compliance

---

## User Documentation

### How to Upload a Custom Playbook

#### Option 1: Simple Playbook (Single File)

**Step 1: Prepare Your Playbook**

Create a valid Ansible playbook in YAML format:

```yaml
---
- name: My Custom Backup Playbook
  hosts: all
  become: yes

  tasks:
    - name: Create backup directory
      file:
        path: /var/backups/myapp
        state: directory
        owner: root
        group: root
        mode: '0755'

    - name: Backup application files
      archive:
        path: /var/www/myapp
        dest: /var/backups/myapp/backup-{{ ansible_date_time.date }}.tar.gz
        format: gz
```

**Step 2: Upload**

1. Navigate to **Dashboard → Playbooks → Upload**
2. Select "Simple Playbook"
3. Drag and drop your `.yml` file or click "Choose File"
4. Review validation results
5. Add description and tags (optional)
6. Click "Upload Playbook"

#### Option 2: Playbook Package (With Templates/Files)

**Step 1: Create Package Structure**

Organize your playbook with templates and files:

```
nginx-setup/
├── playbook.yml              # Main playbook
├── templates/
│   ├── nginx.conf.j2         # Jinja2 template
│   └── site.conf.j2
└── files/
    └── index.html            # Static file
```

**Example playbook.yml with templates:**

```yaml
---
- name: Setup Nginx
  hosts: webservers
  become: yes

  vars:
    server_name: example.com
    web_root: /var/www/html

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present

    - name: Deploy nginx config
      template:
        src: templates/nginx.conf.j2  # Relative path within package
        dest: /etc/nginx/nginx.conf
      notify: restart nginx

    - name: Deploy site config
      template:
        src: templates/site.conf.j2
        dest: /etc/nginx/sites-available/{{ server_name }}

    - name: Copy index page
      copy:
        src: files/index.html  # Relative path within package
        dest: "{{ web_root }}/index.html"

  handlers:
    - name: restart nginx
      systemd:
        name: nginx
        state: restarted
```

**Step 2: Create ZIP Archive**

```bash
cd nginx-setup/
zip -r nginx-setup.zip playbook.yml templates/ files/
```

**Step 3: Upload Package**

1. Navigate to **Dashboard → Playbooks → Upload**
2. Select "Playbook Package"
3. Upload your ZIP file
4. Select entry point (defaults to `playbook.yml`)
5. Review package contents preview
6. Add description and tags
7. Click "Upload Package"

#### Execute Your Playbook

1. Go to **Dashboard → Playbooks**
2. Click on your uploaded playbook
3. Click "Execute"
4. Select target servers
5. Review variables (if any)
6. Click "Run Playbook"

#### View Results

1. Monitor execution in real-time
2. View output logs per server
3. Check success/failure status
4. Download full execution logs

#### Backup and Restore

**Export all playbooks:**
1. Go to **Dashboard → Playbooks**
2. Click "Export All"
3. Download ZIP file containing all your playbooks and metadata

**Import playbooks:**
1. Go to **Dashboard → Playbooks**
2. Click "Import"
3. Upload previously exported ZIP file
4. Review import results

---

## Testing Strategy

### Unit Tests

**Laravel (PHPUnit)**:

```php
// tests/Unit/Services/PlaybookValidationTest.php
class PlaybookValidationTest extends TestCase
{
    public function test_valid_playbook_passes_validation()
    {
        $yaml = <<<YAML
---
- name: Test
  hosts: all
  tasks:
    - name: Ping
      ping:
YAML;

        $validator = new PlaybookValidator();
        $result = $validator->validate($yaml);

        $this->assertTrue($result['valid']);
    }

    public function test_invalid_yaml_fails_validation()
    {
        $yaml = "invalid: yaml: syntax";

        $validator = new PlaybookValidator();
        $result = $validator->validate($yaml);

        $this->assertFalse($result['valid']);
        $this->assertStringContainsString('YAML syntax error', $result['error']);
    }

    public function test_playbook_without_hosts_fails()
    {
        $yaml = <<<YAML
---
- name: Test
  tasks:
    - name: Ping
      ping:
YAML;

        $validator = new PlaybookValidator();
        $result = $validator->validate($yaml);

        $this->assertFalse($result['valid']);
        $this->assertStringContainsString('hosts', $result['error']);
    }
}
```

### Integration Tests

**Laravel (Feature Tests)**:

```php
// tests/Feature/PlaybookUploadTest.php
class PlaybookUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_upload_playbook()
    {
        $user = User::factory()->create();

        $file = UploadedFile::fake()->createWithContent('test.yml', <<<YAML
---
- name: Test
  hosts: all
  tasks:
    - name: Ping
      ping:
YAML);

        $response = $this->actingAs($user)
            ->post('/api/playbooks', [
                'file' => $file,
                'name' => 'Test Playbook',
                'description' => 'A test playbook',
                'tags' => ['test'],
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('admiral.playbooks', [
            'user_id' => $user->id,
            'name' => 'Test Playbook',
        ]);
    }

    public function test_playbook_is_stored_on_filesystem()
    {
        // ... test file storage
    }

    public function test_user_can_only_see_own_playbooks()
    {
        // ... test user isolation
    }
}
```

### End-to-End Tests

**Playwright/Cypress**:

```typescript
// tests/e2e/playbook-upload.spec.ts
test('user can upload and execute playbook', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to upload page
  await page.goto('/dashboard/playbooks/upload');

  // Upload file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('fixtures/test-playbook.yml');

  // Wait for validation
  await page.waitForSelector('.validation-success');

  // Fill metadata
  await page.fill('input[name="name"]', 'E2E Test Playbook');
  await page.fill('textarea[name="description"]', 'Uploaded via E2E test');

  // Submit
  await page.click('button:has-text("Upload Playbook")');

  // Verify success
  await expect(page.locator('.toast-success')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/playbooks$/);
});
```

---

## Future Enhancements

### Phase 2+ Features

1. **Playbook Marketplace** (Tier 2+)
   - Community-contributed playbooks
   - Star/favorite system
   - Comments and ratings
   - Fork and customize

2. **Scheduled Execution**
   - Run playbooks on cron schedule
   - Maintenance windows
   - Calendar view

3. **Playbook Templates**
   - Pre-built templates for common tasks
   - Variable substitution in templates
   - Template gallery

4. **Advanced Editor** (Tier 3)
   - In-browser YAML editor with syntax highlighting
   - Auto-completion for Ansible modules
   - Live validation as you type
   - Integrated documentation

5. **Ansible Vault Integration**
   - Encrypt sensitive variables
   - Vault password management
   - Automatic decryption during execution

6. **Git Sync** (Phase 5)
   - Sync playbooks from Git repositories
   - GitOps workflow
   - Automatic execution on git push

---

## Success Metrics

### Launch Metrics (First 3 Months)

- **Adoption**: 30% of active users upload at least 1 custom playbook
- **Usage**: 50% of uploaded playbooks executed at least once
- **Validation**: <5% upload failure rate due to validation errors
- **Backup**: 10% of users export playbooks for backup

### Quality Metrics

- **Execution Success**: >80% of custom playbook executions succeed
- **Upload Time**: <3 seconds for typical 100KB playbook
- **Validation Time**: <1 second for YAML validation
- **Search Performance**: <500ms for playbook search queries

---

## FAQ

### Q: Can I upload Ansible roles?
**A**: Not in the traditional sense. You can upload playbook packages (ZIP files) with templates and files, but not full role directory structures. This covers most use cases without the complexity of role management.

### Q: How do I use variables in custom playbooks?
**A**: You can define variables in your playbook using `vars:` section, or pass them during execution via the web UI.

### Q: Are my playbooks private?
**A**: Yes. All playbooks are private to your account. Other users cannot see or execute your playbooks.

### Q: Can I share playbooks with my team?
**A**: Not in Phase 1. Team sharing and playbook marketplace are planned for Phase 3+.

### Q: What happens if I upload a playbook with syntax errors?
**A**: The validation will fail and show you the specific error. Fix the YAML and re-upload.

### Q: Can I edit playbooks after uploading?
**A**: Yes. Updating a playbook creates a new version. All previous versions are retained for rollback.

### Q: How do I backup my playbooks?
**A**: Use the "Export All Playbooks" button to download a ZIP file containing all your playbooks and metadata.

### Q: What file size limit exists for playbooks?
**A**: 1MB per playbook file. This is sufficient for even very large playbooks.

### Q: Can I use Ansible Galaxy roles in my playbooks?
**A**: Not automatically in Phase 1. You'll need to pre-install roles on the Admiral server. Automatic Galaxy role installation is planned for Phase 3.

### Q: What's the difference between a simple playbook and a package?
**A**:
- **Simple playbook**: Single `.yml` file with all tasks defined inline. Good for straightforward automation.
- **Package**: ZIP containing playbook + templates + files. Use when you need Jinja2 templates or static files.

### Q: Can I use the `template` module in simple playbooks?
**A**: No. The `template` module requires template files to exist on disk. Use playbook packages instead, or use the `copy` module with inline `content:` for simple templates.

### Q: How do I reference templates in a package?
**A**: Use relative paths from the package root. Example: `src: templates/nginx.conf.j2` or `src: files/index.html`.

---

## References

- [Ansible Playbook Documentation](https://docs.ansible.com/ansible/latest/playbook_guide/index.html)
- [YAML Specification](https://yaml.org/spec/1.2.2/)
- Laravel File Uploads: [Laravel Docs](https://laravel.com/docs/11.x/filesystem)
- Inertia.js File Uploads: [Inertia Docs](https://inertiajs.com/file-uploads)

---

**Document Status**: Draft
**Next Review**: After Phase 2.1 implementation begins
**Owner**: Engineering Team

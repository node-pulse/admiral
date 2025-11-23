# Custom Playbook Upload Feature

**Status**: In Development
**Target**: Phase 2.1
**Created**: 2025-11-01
**Updated**: 2025-11-11

---

## Overview

This feature enables users to upload custom Ansible playbooks through the Flagship web UI. It provides a simple file-based approach where uploaded playbooks are stored in `ansible/custom/` and displayed in the existing Ansible playbooks file browser.

Users can upload either:

1. **Simple playbooks** - Single `.yml` or `.yaml` file with inline tasks
2. **Playbook packages** - `.zip` archive containing playbook + templates + files

### Goals

1. **Enable customization** - Users can run their own automation tasks beyond built-in playbooks
2. **Maintain simplicity** - Upload via web form, files stored in filesystem, no database needed
3. **Ensure safety** - Basic YAML validation prevents syntax errors
4. **Leverage existing UI** - Use the existing Ansible playbooks file browser

### Non-Goals

- Database storage for playbook metadata (filesystem-only approach)
- Advanced versioning system
- Playbook marketplace or sharing between users
- Advanced YAML editor with syntax highlighting
- Git integration
- Complex validation/sandboxing (users are trusted)

---

## Architecture

### Storage Strategy: Filesystem Only

**Why Filesystem-Only?**

1. **Simplicity** - No database schema, no ORM complexity
2. **Ansible-native** - Ansible requires files on disk anyway
3. **Existing UI** - File browser already shows directory trees
4. **Easy backup** - Just backup the `ansible/custom/` directory
5. **No sync issues** - Single source of truth (the filesystem)

```
┌─────────────────────────────────────────────────────────┐
│  User uploads playbook via Web UI                      │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Flagship validates YAML syntax                         │
│  - Parse YAML structure                                 │
│  - Check for required Ansible keys                      │
│  - Basic security scan (no hardcoded secrets)           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Save to ansible/custom/                                │
│                                                          │
│  Simple playbook:   custom/my-playbook.yml              │
│  Package:           custom/nginx-setup/                 │
│                       ├── playbook.yml                  │
│                       ├── templates/                    │
│                       │   └── nginx.conf.j2             │
│                       └── files/                        │
│                           └── index.html                │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Existing Ansible Playbooks file browser shows files   │
│  User can view, execute, or delete playbooks           │
└─────────────────────────────────────────────────────────┘
```

---

## Filesystem Structure

```
ansible/
├── nodepulse/                  # Built-in system playbooks
│   ├── deploy.yml
│   └── uninstall.yml
│
├── catalog/                    # Community playbooks (from registry)
│   └── f/
│       └── fail2ban/
│           ├── manifest.json
│           ├── playbook.yml
│           └── templates/
│
└── custom/                     # User-uploaded playbooks (NEW)
    ├── .gitignore              # Ignore all except README
    ├── README.md
    │
    ├── my-backup.yml           # Simple playbook
    ├── deploy-app.yml          # Simple playbook
    │
    ├── nginx-setup/            # Playbook package
    │   ├── playbook.yml
    │   ├── templates/
    │   │   ├── nginx.conf.j2
    │   │   └── site.conf.j2
    │   └── files/
    │       └── index.html
    │
    └── wordpress/              # Another package
        ├── playbook.yml
        ├── templates/
        │   └── wp-config.php.j2
        └── files/
            └── .htaccess
```

---

## Validation Rules

### File Upload Validation

**Simple Playbook:**

- File extension: `.yml` or `.yaml` only
- Max file size: 100MB
- YAML syntax must be valid
- Must have Ansible playbook structure (`hosts`, `tasks` or `roles`)

**Playbook Package (ZIP):**

- File extension: `.zip` only
- Max file size: 100MB
- **Must contain a `manifest.json` file** following the Node Pulse Admiral schema
- Total extracted size must not exceed 100MB
- Can include any file types (templates, configs, scripts, etc.)

### YAML Structure Validation (Simple Playbooks Only)

```php
// Basic validation rules for simple .yml uploads:
1. Must be valid YAML (parseable)
2. Must be a list of plays (array)
3. Each play must have 'hosts' key
4. Each play must have 'tasks' or 'roles'
```

### Manifest Validation (Package Uploads)

ZIP packages **must** include a `manifest.json` file with these required fields:

```json
{
  "$schema": "https://raw.githubusercontent.com/node-pulse/playbooks/refs/heads/main/schemas/node-pulse-admiral-playbook-manifest-v1.schema.json",
  "id": "pb_aB3xK9mN2q", // Format: pb_XXXXXXXXXX (10 alphanumeric)
  "name": "My Custom Playbook",
  "version": "1.0.0",
  "description": "What this playbook does",
  "author": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "category": "monitoring", // One of: monitoring, database, search, security, proxy, storage, dev-tools
  "tags": ["nginx", "web"],
  "ansible_version": ">=2.15",
  "os_support": [
    {
      "distro": "ubuntu",
      "version": "22.04",
      "arch": "both"
    }
  ],
  "license": "MIT"
}
```

See full schema: [node-pulse-admiral-playbook-manifest-v1.schema.json](https://github.com/node-pulse/playbooks/blob/main/schemas/node-pulse-admiral-playbook-manifest-v1.schema.json)

### Security Checks

**Basic Secret Detection (warnings only):**

- Scans for patterns like `password:`, `api_key:`, `secret:`, `token:`
- Warns user but doesn't block upload
- Encourages use of Ansible Vault or variables

**Path Traversal Prevention:**

- Filenames sanitized to remove `..`, `/`, `~`
- All uploads restricted to `ansible/custom/` directory
- Realpath validation on all file operations

---

## API Endpoints

### Upload Custom Playbook

```http
POST /api/custom-playbooks/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  - file: playbook.yml OR package.zip (required)
  - name: string (optional - custom filename)

Response: 201 Created (Simple Playbook)
{
  "success": true,
  "message": "Playbook uploaded successfully",
  "playbook": {
    "name": "my-backup.yml",
    "path": "custom/my-backup.yml",
    "size": 1234,
    "type": "simple"
  },
  "validation": {
    "valid": true,
    "warnings": []
  }
}

Response: 201 Created (Package)
{
  "success": true,
  "message": "Playbook package uploaded successfully",
  "playbook": {
    "name": "nginx-setup",
    "path": "custom/nginx-setup",
    "type": "package",
    "contents": {
      "playbooks": ["playbook.yml"],
      "templates": ["templates/nginx.conf.j2", "templates/site.conf.j2"],
      "files": ["files/index.html"]
    }
  },
  "validation": {
    "valid": true,
    "warnings": []
  }
}

Response: 422 Unprocessable Entity (Validation Failed)
{
  "success": false,
  "message": "YAML validation failed",
  "errors": [
    "YAML syntax error: expected <block end>, but found ...",
    "Play #0 missing required 'hosts' key"
  ]
}

Response: 409 Conflict (File Exists)
{
  "success": false,
  "message": "A playbook with this name already exists"
}
```

### Delete Custom Playbook

```http
DELETE /api/custom-playbooks/delete
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "path": "custom/my-backup.yml"
}

Response: 200 OK
{
  "success": true,
  "message": "Playbook deleted successfully"
}

Response: 403 Forbidden (Invalid Path)
{
  "success": false,
  "message": "Invalid path: must be under custom/ directory"
}
```

---

## Web UI Components

### Upload Modal/Page

**Route**: `/dashboard/ansible/playbooks` (add upload button to existing page)

**UI Components:**

1. **Upload Button** in existing Ansible Playbooks page toolbar

   - Opens modal or dedicated upload page

2. **File Upload Area**

   - Drag-and-drop zone
   - File picker button
   - Accepts `.yml`, `.yaml`, `.zip` files (max 100MB)
   - Shows file preview after selection

3. **Optional Name Field**

   - Auto-filled from filename
   - User can override with custom name
   - Sanitized automatically

4. **Validation Preview**

   - Real-time YAML validation after file selection
   - Shows syntax errors or validation warnings
   - Package contents preview (for ZIP files)

5. **Upload Button**
   - Disabled until validation passes
   - Shows progress indicator
   - Success/error notifications

**Example React Component:**

```typescript
// flagship/resources/js/components/ansible/upload-playbook-modal.tsx
import { useForm } from "@inertiajs/react";
import { useState } from "react";

interface UploadForm {
  file: File | null;
  name: string;
}

export function UploadPlaybookModal({ open, onClose }) {
  const { data, setData, post, processing, errors } = useForm<UploadForm>({
    file: null,
    name: "",
  });

  const [validation, setValidation] = useState(null);

  const handleFileChange = async (file: File) => {
    setData("file", file);

    // Auto-fill name from filename
    const name = file.name.replace(/\.(yml|yaml|zip)$/i, "");
    setData("name", name);

    // TODO: Client-side validation preview
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    post("/api/custom-playbooks/upload", {
      forceFormData: true,
      onSuccess: () => {
        onClose();
        // Refresh file tree
      },
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FileDropzone
          onFileSelect={handleFileChange}
          accept=".yml,.yaml,.zip"
          maxSize={100 * 1024 * 1024} // 100MB
        />

        <Input
          label="Name (optional)"
          value={data.name}
          onChange={(e) => setData("name", e.target.value)}
          placeholder="my-playbook"
        />

        {validation && <ValidationPreview result={validation} />}

        <Button type="submit" disabled={processing || !data.file}>
          Upload Playbook
        </Button>
      </form>
    </Dialog>
  );
}
```

### Integration with Existing File Browser

The existing `AnsiblePlaybooksController` already displays `ansible/custom/` automatically:

- Shows directory tree
- Displays file sizes and modification times
- Allows viewing YAML content
- Supports syntax highlighting

**Special handling for custom/ directory:**

1. **All file types shown** - Unlike system/catalog playbooks (only .yml/.yaml/.j2), custom directory shows ALL files
2. **Binary files** - Displayed in tree but show "Binary file type - cannot display content" when clicked
3. **Text file types viewable**: .yml, .yaml, .j2, .json, .md, .txt, .sh, .conf, .ini, .cfg, .env, .properties, .log, .xml, .html, .css, .js
4. **Binary file types**: .bin, .exe, .so, .dll, .zip, .tar, .gz, images, PDFs (shown but not viewable)
5. **Delete button** - Available for custom playbooks only (not system/catalog)
6. **Upload button** - In page toolbar

---

## Implementation Checklist

### Phase 1: Backend (Laravel)

- [x] Create `ansible/custom/` directory with `.gitignore`
- [x] Create `CustomPlaybooksController` with upload/delete methods
- [ ] Add routes to `routes/api.php`
- [ ] Add YAML validation using Symfony YAML component
- [ ] Add ZIP extraction and validation
- [ ] Write unit tests for validation logic
- [ ] Write feature tests for upload/delete

### Phase 2: Frontend (React/Inertia)

- [ ] Create upload modal component
- [ ] Add file dropzone with validation
- [ ] Add upload button to Ansible Playbooks page
- [ ] Add delete button for custom playbooks
- [ ] Add "Custom" badge to distinguish files
- [ ] Add toast notifications for success/errors
- [ ] Refresh file tree after upload/delete

### Phase 3: Testing

- [ ] Test YAML validation with valid/invalid playbooks
- [ ] Test ZIP package upload and extraction
- [ ] Test file size limits
- [ ] Test path traversal prevention
- [ ] Test delete functionality
- [ ] E2E test for full upload flow

### Phase 4: Documentation

- [ ] Update user documentation
- [ ] Add example playbooks
- [ ] Document upload limits and validation rules

---

## Security Considerations

### Upload Security

1. **File Type Restrictions**

   - Only `.yml`, `.yaml`, `.zip` allowed
   - No executable files in ZIP packages
   - MIME type validation

2. **File Size Limits**

   - Single file: 100MB max
   - Extracted package: 100MB max

3. **Path Traversal Prevention**

   - Filename sanitization (remove `..`, `/`, `~`)
   - Realpath validation on all operations
   - Restrict all operations to `ansible/custom/` only

4. **YAML Validation**

   - Parse with safe YAML loader
   - Check basic Ansible structure
   - Warn on potential secrets (not blocking)

5. **User Isolation**
   - All users share `ansible/custom/` directory (single-tenant assumption)
   - Admin-only access controls who can upload/delete

### Execution Security

- Playbooks run in same context as system playbooks
- No additional sandboxing (users are trusted admins)
- Full Ansible capabilities available

---

## User Documentation

### How to Upload a Custom Playbook

#### Option 1: Simple Playbook (Single YAML File)

**Step 1: Prepare Your Playbook**

Create a valid Ansible playbook:

```yaml
---
- name: My Custom Backup
  hosts: all
  become: yes

  tasks:
    - name: Create backup directory
      file:
        path: /var/backups/myapp
        state: directory
        mode: "0755"

    - name: Backup files
      archive:
        path: /var/www/myapp
        dest: /var/backups/myapp/backup-{{ ansible_date_time.date }}.tar.gz
```

**Step 2: Upload via Web UI**

1. Navigate to **Ansible → Playbooks**
2. Click **Upload Custom Playbook** button
3. Select your `.yml` file or drag-and-drop
4. Review validation results
5. (Optional) Change the name
6. Click **Upload**

**Step 3: Execute**

1. The playbook now appears in the file tree under `custom/`
2. Click on it to view content
3. Use it in deployments by referencing `custom/my-backup.yml`

#### Option 2: Playbook Package (With Templates)

**Step 1: Create Package Structure**

```
nginx-setup/
├── playbook.yml
├── templates/
│   └── nginx.conf.j2
└── files/
    └── index.html
```

**Example playbook.yml:**

```yaml
---
- name: Setup Nginx
  hosts: webservers
  become: yes

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present

    - name: Deploy config
      template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: restart nginx

  handlers:
    - name: restart nginx
      systemd:
        name: nginx
        state: restarted
```

**Step 2: Create ZIP**

```bash
cd nginx-setup/
zip -r nginx-setup.zip .
```

**Step 3: Upload**

1. Navigate to **Ansible → Playbooks**
2. Click **Upload Custom Playbook**
3. Select your `.zip` file
4. Review package contents
5. Click **Upload**

**Step 4: Execute**

Reference the package in deployments: `custom/nginx-setup/playbook.yml`

### Deleting Custom Playbooks

1. Navigate to **Ansible → Playbooks**
2. Expand `custom/` directory
3. Find your playbook
4. Click the delete icon (only available for custom playbooks)
5. Confirm deletion

---

## Future Enhancements

### Potential Improvements (Phase 3+)

1. **Playbook Templates**

   - Pre-built templates for common tasks
   - Template gallery in UI

2. **Inline Editor**

   - Edit playbooks directly in browser
   - Syntax highlighting and validation

3. **Export/Import**

   - Bulk export all custom playbooks as ZIP
   - Import previously exported archives

4. **Scheduled Execution**

   - Run custom playbooks on cron schedule
   - Maintenance windows

5. **Ansible Vault Support**
   - Upload encrypted vault files
   - Vault password management

---

## FAQ

### Q: Where are custom playbooks stored?

**A**: In `ansible/custom/` directory on the Admiral server. They're regular files on disk, accessible to Ansible.

### Q: Can I organize playbooks into subdirectories?

**A**: Yes! When you upload a ZIP package, it creates a subdirectory automatically. You can also create subdirectories manually by uploading packages with nested structure.

### Q: Are custom playbooks backed up?

**A**: They're regular files, so include `ansible/custom/` in your backup strategy. The directory is gitignored, so files won't be committed to version control.

### Q: Can I share playbooks with other users?

**A**: Yes, all admin users see the same `ansible/custom/` directory. Any uploaded playbook is accessible to all admins.

### Q: What's the file size limit?

**A**: 100MB per upload and 100MB maximum extracted size for ZIP packages.

### Q: Can I use Ansible Galaxy roles?

**A**: Not automatically. You'd need to pre-install roles on the server. Automatic Galaxy role installation is a future enhancement.

### Q: How do I use templates in custom playbooks?

**A**: Upload a ZIP package with a `templates/` directory. Reference templates with relative paths like `src: templates/nginx.conf.j2`.

### Q: What happens if I upload a file with the same name?

**A**: The upload will fail with a 409 Conflict error. Delete the old file first, or use a different name.

---

## References

- [Ansible Playbook Documentation](https://docs.ansible.com/ansible/latest/playbook_guide/index.html)
- [YAML Specification](https://yaml.org/spec/1.2.2/)
- Laravel File Uploads: [Laravel Docs](https://laravel.com/docs/11.x/filesystem)
- Inertia.js File Uploads: [Inertia Docs](https://inertiajs.com/file-uploads)
- Symfony YAML Component: [Symfony Docs](https://symfony.com/doc/current/components/yaml.html)

---

**Document Status**: Updated (Filesystem-only approach)
**Next Steps**: Complete frontend implementation
**Owner**: Engineering Team

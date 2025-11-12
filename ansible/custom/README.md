# Custom Playbooks

This directory contains user-uploaded custom Ansible playbooks.

## Structure

Users can upload:
- **Simple playbooks** - Single `.yml` or `.yaml` files
- **Playbook packages** - `.zip` files containing playbook + templates + files

## Usage

1. Upload via Flagship dashboard: **Ansible → Upload Custom Playbook**
2. Files are stored here and accessible via the file browser
3. Execute via Deployments using the playbook path

## Security

- Only authenticated users can upload
- Files are validated for YAML syntax
- Maximum file size: 100MB
- Allowed extensions: `.yml`, `.yaml`, `.zip`

## Notes

- This directory is ignored by Git (user uploads are not committed)
- Backups should include this directory if you want to preserve custom playbooks

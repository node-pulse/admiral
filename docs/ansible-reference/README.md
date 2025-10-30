# Ansible Reference Documentation

This directory contains detailed technical reference documentation for the Ansible agent deployment system.

## 📁 Contents

### [architecture.md](./architecture.md)
Complete architecture diagrams, data flow, and component interactions.

**Topics:**
- System architecture overview
- Data flow diagrams
- Component interaction patterns
- Directory structure
- Integration points

### [playbooks.md](./playbooks.md)
Complete Ansible playbook and role code examples.

**Topics:**
- All playbook YAML files
- Role task definitions
- Template files (Jinja2)
- Handlers and variables
- Default configurations

### [laravel-integration.md](./laravel-integration.md)
Laravel backend integration code and examples.

**Topics:**
- Database schema and migrations
- Eloquent models (Deployment, DeploymentServer)
- AnsibleService implementation
- Queue jobs (DeployAgentJob)
- API controllers
- Routes and middleware

### [frontend.md](./frontend.md)
React/Inertia.js frontend components.

**Topics:**
- Deployment index page
- Create deployment form
- Deployment details view
- Real-time updates
- Component structure

### [security.md](./security.md)
Security considerations and best practices.

**Topics:**
- SSH key management
- Encryption at rest
- Authentication and authorization
- Process isolation
- Rate limiting

### [performance.md](./performance.md)
Performance optimization strategies.

**Topics:**
- Parallel execution tuning
- Connection pooling
- Fact caching
- Queue optimization
- Database indexing

---

## Quick Navigation

**New to Ansible deployment?**
→ Start with [../ANSIBLE_README.md](../ANSIBLE_README.md)

**Need implementation status?**
→ See [../ansible-implementation-status.md](../ansible-implementation-status.md)

**Working with simplified metrics?**
→ See [../ansible-simplified-metrics.md](../ansible-simplified-metrics.md)

**Need complete code examples?**
→ Browse this directory (ansible-reference/)

---

## How to Use This Reference

1. **Quick Lookup**: Use Ctrl+F / Cmd+F to search across files
2. **Code Examples**: All code blocks are copy-paste ready
3. **Context**: Each file is self-contained with full context
4. **Updates**: These files are extracted from the complete planning document

---

**Source:** Content extracted from `ansible-agent-deployment.md`
**Last Updated:** 2025-10-30

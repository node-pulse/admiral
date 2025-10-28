# Common Role

This role contains shared tasks and utilities used across all Node Pulse Ansible roles.

## Purpose

The `common` role provides reusable tasks that multiple roles need, avoiding code duplication and ensuring consistency across the infrastructure.

## Available Tasks

### `prerequisite.yml`

Verifies that target servers meet minimum system requirements for Node Pulse components.

**Checks:**
- Python version (2.7+ or 3.5+)
- systemd is available (for service management)

**Usage in other roles:**

```yaml
---
# tasks/main.yml
- import_role:
    name: common
    tasks_from: prerequisite

# ... rest of your role tasks
```

## Directory Structure

```
common/
├── tasks/
│   ├── main.yml          # Default entry point
│   └── prerequisite.yml  # System prerequisite checks
├── meta/
│   └── main.yml          # Role metadata
└── README.md             # This file
```

## Adding New Shared Tasks

When you have a task that needs to be used in multiple roles:

1. Create the task file in `tasks/`:
   ```bash
   vi flagship/ansible/roles/common/tasks/my_shared_task.yml
   ```

2. Document it in this README

3. Use it in other roles:
   ```yaml
   - import_role:
       name: common
       tasks_from: my_shared_task
   ```

## Examples

### Full Role Import (runs main.yml)

```yaml
- hosts: servers
  roles:
    - common  # Runs tasks/main.yml (prerequisite check)
```

### Selective Task Import

```yaml
- hosts: servers
  tasks:
    - import_role:
        name: common
        tasks_from: prerequisite
```

### Multiple Task Imports

```yaml
- hosts: servers
  tasks:
    - import_role:
        name: common
        tasks_from: prerequisite

    - import_role:
        name: common
        tasks_from: another_task
```

## Best Practices

1. **Keep tasks generic** - Don't put role-specific logic here
2. **Use variables** - Make tasks configurable via variables
3. **Document everything** - Update this README when adding new tasks
4. **Test independently** - Ensure tasks work standalone
5. **Version control** - Common tasks affect all roles, review changes carefully

## Related Roles

- `nodepulse-agent` - Uses `prerequisite.yml`
- Future roles will also use this common role

## License

MIT

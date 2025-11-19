# Self-Hostable Projects

## Analytics & Monitoring

- [x] Umami website analytics
- [ ] Plausible Analytics
- [ ] Matomo – web analytics (19k+ stars)
- [ ] PostHog – product analytics (18k+ stars)
- [ ] Grafana – visualization & dashboards
- [x] Prometheus – metrics & alerting
- [ ] Uptime Kuma – uptime monitoring

## AI / LLM Applications (GPU-Free, VPS-Friendly)

### 🔵 Core LLM Stack

- [ ] Ollama – local LLM inference (CPU-friendly small models)
- [ ] LocalAI – OpenAI-compatible API server (CPU-only mode)
- [ ] LiteLLM – unified LLM proxy/gateway (OpenAI/DeepSeek/Claude/Groq)
- [ ] Open WebUI – ChatGPT-style interface for Ollama/LocalAI/OpenAI

### 🤖 AI Coding Assistants (Self-hosted Copilot)

- [ ] Tabby – self-hosted GitHub Copilot alternative (Highly Recommended)
  - Single binary/Docker deployment, lightweight
  - CPU quantization mode (GPU optional)
  - VS Code / IntelliJ plugins available
  - ⭐⭐ Deployment difficulty: Very low
- [ ] Continue – AI programming assistant gateway
  - Connects to local Ollama or Tabby
  - VS Code Chat, Autocomplete, Refactor features
  - Lightweight and extensible

### 🔍 AI Search Engine (Self-hosted Perplexity)

- [ ] Perplexica – open-source Perplexity AI alternative (🔥 2025 trending)
  - Combines SearXNG meta-search with local LLM
  - Generates answers with citations/references
  - Docker Compose one-click deployment
  - No ads, private search experience

### 🟢 Document Q&A / RAG Systems

- [ ] AnythingLLM – document knowledge base & RAG (Highly Recommended)
- [ ] DocsGPT – self-hosted documentation Q&A
- [ ] Flowise – drag-and-drop LLM pipelines / agents (LangChain visual UI)
  - Visual node-based RAG builder (PDF → split → vectorize → Q&A)
  - More AI-focused than n8n

### 🟡 Document Management / OCR

- [ ] PaddleOCR – lightweight OCR engine (CPU OK, ideal for VPS)
- [ ] Paperless-ngx – document OCR + archive (OCRmyPDF backend)
- [ ] Mayan EDMS – enterprise electronic document system (heavier)
- [ ] EasyOCR
- [ ] OCRmyPDF
- [ ] Tesseract OCR

### 🟣 Vector DB & Embedding Infra

- [ ] ChromaDB – lightweight local vector DB (CPU-friendly)
- [ ] Weaviate (CPU mode) – scalable vector database

### 🗣️ Voice & Audio (TTS & Voice Conversion)

- [ ] OpenAI-Edge-TTS – Microsoft Edge TTS API wrapper
  - Free, no GPU needed, near-zero resource usage
  - Natural-sounding voices (same as short video narration)
  - Works with Open WebUI or Home Assistant
  - Extremely lightweight
- [ ] RVC (Retrieval-based Voice Conversion) – voice cloning/conversion
  - Entertainment-focused, fun for content creators
  - Requires some GPU for training but can run inference on CPU

### 🧠 AI Agents & Workflow Automation

- [ ] Dify – LLM application development platform (⚠️ Heavier but extremely powerful)
  - Most popular open-source AI platform in China
  - Enterprise AI knowledge base solution
  - Needs 8-9 containers (Redis, Postgres, Weaviate, Sandbox, etc.)
  - Recommended: 2C/4–8GB RAM minimum
  - High value if packaged as One-Click Playbook

### ⚠️ Optional / Heavier (Still VPS-compatible but more resource usage)

- [ ] (See Dify above – moved to AI Agents section)

## Databases & Storage

- [ ] PostgreSQL
- [ ] MySQL / MariaDB
- [ ] Elasticsearch / OpenSearch
- [ ] MinIO
- [ ] SeaweedFS
- [ ] Seafile
- [ ] Immich
- [ ] Qdrant – vector DB
- [ ] Weaviate – vector & hybrid search
- [ ] Milvus – enterprise vector DB
- [ ] Chroma – simple vector DB for RAG
- [ ] Vald – cloud-native vector engine (K8s)

## Knowledge, Docs, Wiki

- [ ] Wiki.js
- [ ] DokuWiki
- [ ] MediaWiki
- [ ] Paperless-ngx
- [ ] Meilisearch

## Productivity / Office Tools

- [ ] Stirling-PDF – powerful PDF toolbox (merge, split, convert, OCR) – fully local processing
- [ ] FileBrowser – web-based file manager with sharing capabilities

## CMS / Blogging

- [ ] WordPress
- [ ] Ghost
- [ ] Drupal
- [ ] Grav
- [ ] Jekyll
- [ ] Hugo

## Developer Tools & Environments

- [ ] GitLab CI/CD – included with GitLab (起步 4GB RAM，推荐 8GB)
- [ ] Gitea
- [ ] Drone CI
- [ ] Jenkins
- [ ] Sentry (self-hosted)
- [ ] SonarQube – code quality & security
- [ ] Codecov – code coverage
- [ ] Code-Server – VS Code in browser (65k+ stars)
- [ ] Gitpod – cloud development environments (12k+ stars)
- [ ] Backstage – Spotify's developer portal (25k+ stars)
- [ ] GlitchTip – Sentry alternative (1.5k+ stars)

## Communication

- [ ] Mastodon

## Automation / Orchestration

- [ ] n8n – no-code automation workflows with AI nodes
- [ ] Node-RED – flow-based automation with AI plugins
- [ ] Windmill – workflow automation, Python/TS, LLM integrations
- [ ] Activepieces – open-source Zapier alternative with AI support
- [ ] Temporal – workflow orchestration, AI pipelines
- [ ] Apache Airflow – workflow orchestration with DAGs

## Project Management / Collaboration

- [ ] Taiga – agile project management
- [ ] Plane – Jira/Linear alternative
- [ ] Focalboard – Trello/Notion alternative
- [ ] Wekan – Kanban board
- [ ] OpenProject – project management suite

## Media / Entertainment

- [ ] Jellyfin – media server
- [ ] Plex – media server
- [ ] Navidrome – music streaming
- [ ] Photoprism – AI-powered photo management
- [ ] Nextcloud – file sync & share

## Email / Calendar

- [ ] Mailcow – mail server suite
- [ ] Mailu – simple mail server
- [ ] Radicale – CalDAV/CardDAV server

## Backup / Sync

- [ ] Restic – backup program
- [ ] Duplicati – backup solution
- [ ] Syncthing – continuous file synchronization
- [ ] Kopia – backup/restore tool

## VPN / Networking

- [ ] WireGuard – VPN
- [ ] Headscale – Tailscale control server
- [ ] OpenVPN – VPN solution
- [ ] NetBird – zero-config VPN

## API / Backend Services

- [ ] Supabase – Firebase alternative
- [ ] Appwrite – Backend-as-a-Service
- [ ] Directus – headless CMS
- [ ] Strapi – headless CMS
- [ ] Hasura – GraphQL engine
- [ ] PostgREST – REST API for PostgreSQL

## Business / E-commerce

- [ ] Invoice Ninja – invoicing & billing
- [ ] Crater – invoicing for freelancers
- [ ] WooCommerce – WordPress e-commerce
- [ ] Magento – enterprise e-commerce
- [ ] PrestaShop – e-commerce platform

## Form Builders / Surveys

- [ ] Typebot – conversational forms
- [ ] Formbricks – open-source Typeform alternative

## Low-code / No-code Platforms

- [ ] NocoDB – Airtable alternative (40k+ stars)
- [ ] Baserow – Airtable alternative (10k+ stars)
- [ ] Budibase – low-code platform (20k+ stars)
- [ ] ToolJet – low-code platform (25k+ stars)
- [ ] Appsmith – low-code app builder (30k+ stars)

## Infrastructure & Hosting

- [ ] Portainer – Docker management (28k+ stars)
- [ ] Traefik – reverse proxy & load balancer
- [ ] Nginx Proxy Manager (NPM) – visual SSL cert management, beginner-friendly
- [ ] Cloudflared – Cloudflare Tunnel for exposing services without public IP
- [ ] Harbor – container registry (22k+ stars)
- [ ] Portus – Docker registry UI

## Dashboards / Home Pages

- [ ] Homepage – application dashboard (15k+ stars)
- [ ] Dashy – self-hosted dashboard (15k+ stars)
- [ ] Homarr – customizable dashboard (5k+ stars)
- [ ] Heimdall – application dashboard (7k+ stars)

## Notifications

- [ ] Ntfy – notification service (16k+ stars)
- [ ] Gotify – notification server (10k+ stars)
- [ ] Apprise – notification library (10k+ stars)

## RSS / Feed Readers

- [ ] FreshRSS – RSS aggregator (8k+ stars)
- [ ] Miniflux – minimalist RSS reader (6k+ stars)
- [ ] Tiny Tiny RSS – web-based news feeds reader

## Bookmarks / Read-later

- [ ] Linkwarden – bookmark manager (6k+ stars)

## Finance / Budgeting

- [ ] Actual Budget – budgeting tool (10k+ stars)
- [ ] Firefly III – personal finance manager (13k+ stars)
- [ ] Maybe – modern finance app (25k+ stars)

## Home Automation

- [ ] Home Assistant – home automation (68k+ stars)
- [ ] ESPHome – ESP8266/ESP32 firmware (7k+ stars)

## Security & Identity

- [ ] Vaultwarden – Bitwarden server (password manager)
- [ ] Passbolt – team password manager
- [ ] Keycloak – SSO/Identity provider
- [ ] Authentik – SSO/Identity provider
- [ ] Vault – HashiCorp Vault (secret management, 29k+ stars)
- [ ] Infisical – secret management (12k+ stars)

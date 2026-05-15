# Render — Redis + Celery Worker Provisioning

This guide covers provisioning the Redis broker and the Celery worker process
needed by Story 2.2's Open Finance sync pipeline.

## 1. Provision Redis (free tier)

1. In the Render dashboard, click **New** -> **Redis**.
2. Name: `mony-redis`.
3. Plan: **Free** (sufficient for sandbox / MVP traffic).
4. Region: same region as the `mony-api` Web Service.
5. Maxmemory policy: `allkeys-lru` (default works for our broker usage).
6. After provisioning, copy the **Internal Connection String**
   (e.g. `redis://red-xxxx:6379`) — that becomes the `REDIS_URL` environment
   variable for both the API service and the Celery worker.

## 2. Add `REDIS_URL` and `WEBHOOK_SECRET` to the API service

Render -> `mony-api` -> **Environment**:

| Key | Value |
|-----|-------|
| `REDIS_URL` | The internal connection string from step 1 |
| `WEBHOOK_SECRET` | 32+ random bytes (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `OF_SYNC_LOOKBACK_DAYS` | `7` |
| `OF_FIRST_SYNC_LOOKBACK_DAYS` | `90` |
| `OF_SYNC_USE_STUB` | `0` (set to `1` while sandbox credentials are pending) |

## 3. Provision the Celery worker as a Background Worker

Render -> **New** -> **Background Worker**:

* Name: `mony-celery-worker`
* Region: same as `mony-api`
* Branch: `main`
* Runtime: same Docker image as `mony-api` (or a `Python 3.11+` runtime if not
  using Docker)
* Build Command: `pip install -r apps/api/requirements.txt`
* Start Command:

  ```bash
  cd apps/api && celery -A workers.celery_app.celery_app worker --loglevel=info --concurrency=2
  ```

Add the same environment variables as the API service (at minimum
`DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `OF_SYNC_*`).

## 4. Provision Celery Beat (periodic scheduler) as a second worker

Render -> **New** -> **Background Worker**:

* Name: `mony-celery-beat`
* Start Command:

  ```bash
  cd apps/api && celery -A workers.celery_app.celery_app beat --loglevel=info
  ```

Beat must run as a single instance — never scale to >1.

## 5. Apply the Story 2.2 migrations

Render Shell on `mony-api`:

```bash
cd apps/api
alembic stamp 0001_baseline   # only on the first deploy after this story
alembic upgrade head
```

The first command marks the existing Story 2.1 schema as the baseline. The
second applies `0002_cleanup_openfinance_legacy` and
`0003_add_transaction_sync_fields`.

## 6. Verify

```bash
# API service shell
cd apps/api
python -c "from workers.celery_app import celery_app; print(celery_app.conf.beat_schedule)"
```

Expected output: `{'sync-all-authorized-accounts': {...}}`.

Manual sync smoke-test:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://mony-api.onrender.com/open-finance/sync
```

Expected: HTTP 202 with `{ "sync_id": "...", "accounts_queued": N, "status": "queued" }`.

## Troubleshooting

* **`No such queue` errors**: `REDIS_URL` mismatch — both worker and API must
  point at the same Redis instance.
* **Beat dispatching nothing**: only one Beat process must run; if you scaled
  the worker, ensure Beat is on its own service set to 1 instance.
* **Tasks stuck in `RUNNING`**: check the worker's logs; `task_acks_late=True`
  means a crashed worker will requeue the task on next start.

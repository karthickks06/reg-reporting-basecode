# SSE Connection Error Analysis

## Error Summary
```
SSE connection error: Event {isTrusted: true, type: 'error', ...}
GET https://reg-reporting.nttd.dedyn.io/api/jobs/stream/BA?project_id=demo-local 
net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)
```

## Root Causes Identified

### 1. **CRITICAL: Missing Endpoint**
**Location**: `backend/app/routes/job_routes.py`

**Issue**: Frontend's `useJobStatus` hook (line 283 in `frontend/hooks/useJobs.ts`) attempts to connect to:
```javascript
new EventSource(`${API_BASE_URL}/jobs/${jobId}/stream`)
```

**BUT** this endpoint **DOES NOT EXIST** in the backend!

**Existing endpoints**:
- ✅ `/jobs/stream/{actor}` - exists
- ✅ `/v1/jobs/stream` - exists  
- ❌ `/jobs/{job_id}/stream` - **MISSING**

### 2. **Infinite Loop Without Proper Error Handling**

**Location**: `backend/app/routes/job_routes.py:69-105` and `backend/app/routes/job_routes.py:131-167`

**Problem**: The SSE event generators use `while True` loops without:
- Proper exception handling (only catches `asyncio.CancelledError`)
- Heartbeat/keepalive messages
- Connection timeout detection
- Maximum retry limits

**Current Code**:
```python
async def event_generator():
    last_jobs_state = {}
    try:
        while True:  # ← Infinite loop
            jobs = get_stream_jobs(...)
            # ... send events ...
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        pass  # ← Only catches CancelledError
```

**Issues**:
- If `get_stream_jobs()` raises an exception → stream breaks silently
- No heartbeat messages → proxies/nginx may timeout
- No way to detect client disconnect properly
- Client sees incomplete chunked encoding error

### 3. **Database Connection Management**

**Location**: `backend/app/routes/job_routes.py:18-38`

**Problem**: `get_stream_jobs()` creates new DB sessions in a loop:
```python
def get_stream_jobs(...):
    db = SessionLocal()  # ← New session every call
    try:
        jobs = job_service.get_jobs(db, ...)
        return [job_service.serialize_job(job) for job in jobs]
    finally:
        db.close()
```

**Called every second** in the infinite loop → potential connection pool exhaustion.

### 4. **No Client Disconnect Detection**

**Problem**: When client disconnects, the backend continues running the loop until `asyncio.CancelledError` is raised, which may not happen immediately.

### 5. **Proxy/Nginx Buffering Issues**

**Current Headers**:
```python
headers={
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # ← Only works for nginx
}
```

**Issues**:
- If behind other proxies (AWS ALB, CloudFront, etc.), they may still buffer
- No explicit chunked transfer encoding set
- No content-type charset specified

### 6. **CORS Configuration Mismatch**

**Location**: `backend/app/main.py:19-25`

**Issue**: CORS only allows:
```python
allow_origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

But the error shows request to: `https://reg-reporting.nttd.dedyn.io`

The production domain is **NOT** in the allowed origins list!

## Error Flow

1. **Frontend** initiates SSE connection to `/api/jobs/stream/BA`
2. **Backend** starts streaming via `event_generator()`
3. **One of these happens**:
   - Exception in `get_stream_jobs()` breaks the generator
   - Proxy timeout (no heartbeat messages)
   - Database connection issues
   - Client disconnect not properly detected
4. **Stream terminates prematurely** → incomplete chunked encoding
5. **Frontend** receives error event and falls back to polling

## Files Affected

### Frontend
- `frontend/hooks/useJobs.ts` (lines 68-189, 278-308)
  - SSE connection logic
  - Error handling
  - Fallback to polling

### Backend
- `backend/app/routes/job_routes.py` (lines 18-189)
  - Missing `/jobs/{job_id}/stream` endpoint
  - SSE event generators with inadequate error handling
  - Database session management in loops
  
- `backend/app/main.py` (lines 19-25)
  - CORS configuration missing production domain

## Recommended Fixes

### Priority 1: Add Missing Endpoint

Add to `backend/app/routes/job_routes.py`:

```python
@router.get("/jobs/{job_id}/stream")
async def stream_single_job(job_id: int):
    """SSE stream for a single job's status updates."""
    
    async def event_generator():
        import json
        last_state = None
        retry_count = 0
        max_retries = 300  # 5 minutes with 1s intervals
        
        try:
            while retry_count < max_retries:
                try:
                    db = SessionLocal()
                    try:
                        job = job_service.get_job(db, job_id)
                        if not job:
                            yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                            break
                        
                        job_data = job_service.serialize_job(job)
                        current_state = f"{job_data['status']}:{job_data['progress_pct']}"
                        
                        if last_state != current_state:
                            last_state = current_state
                            yield f"data: {json.dumps(job_data)}\n\n"
                        else:
                            # Send heartbeat to keep connection alive
                            yield f": heartbeat\n\n"
                        
                        # Close stream if job is terminal
                        if job_data['status'] in ['completed', 'failed', 'cancelled']:
                            break
                        
                        retry_count += 1
                    finally:
                        db.close()
                    
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    break
                    
        except asyncio.CancelledError:
            pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
        },
    )
```

### Priority 2: Improve Existing SSE Endpoints

Add to existing endpoints:
1. **Heartbeat messages** (send `: heartbeat\n\n` when no changes)
2. **Proper exception handling** (catch all exceptions, not just CancelledError)
3. **Maximum connection duration** (prevent infinite loops)
4. **Structured error messages** to client
5. **Connection health checks**

### Priority 3: Fix CORS Configuration

Update `backend/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://reg-reporting.nttd.dedyn.io",  # Add production domain
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Priority 4: Add Retry Logic in Frontend

The frontend already has fallback polling, but could be improved:
- Add exponential backoff for SSE reconnection
- Better error logging
- User notification when SSE fails

## Testing Recommendations

1. **Test endpoint existence**: `curl https://reg-reporting.nttd.dedyn.io/api/jobs/123/stream`
2. **Test SSE connection**: Monitor network tab for incomplete chunks
3. **Test long-running connections**: Keep connection open for 5+ minutes
4. **Test error scenarios**: Database failures, job not found, etc.
5. **Test CORS**: Verify production domain access

## Additional Notes

- The `ERR_INCOMPLETE_CHUNKED_ENCODING` error specifically indicates the stream was terminated prematurely without properly closing the chunked transfer
- The 200 OK status means the connection was established, but failed during streaming
- This is a common issue with SSE when generators raise unhandled exceptions or when proxies buffer/timeout connections

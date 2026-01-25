# Voice Assistant API Documentation

## Overview

The Voice Assistant API provides real-time voice conversation capabilities through a combination of REST endpoints and WebSocket connections.

## Base URL

```
Development: http://localhost:8000
Production: https://your-domain.com/api
```

## Authentication

Authentication is optional but recommended for production use.

### Get Auth Token

```http
POST /auth/token
Content-Type: application/json

{
  "user_id": "optional-user-id"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user_id": "user-123"
}
```

## REST Endpoints

### Health & Status

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "active_sessions": 5,
  "providers": {
    "stt": "healthy",
    "llm": "healthy",
    "tts": "healthy"
  }
}
```

#### API Info
```http
GET /
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "message": "Voice Assistant API"
}
```

### Provider Management

#### List Providers
```http
GET /providers
```

**Response:**
```json
{
  "providers": {
    "stt": {
      "provider_type": "stt",
      "current_provider": "deepgram",
      "fallback_count": 0,
      "providers": [
        {
          "name": "deepgram",
          "priority": 0,
          "enabled": true,
          "available": true,
          "circuit": {
            "name": "stt_deepgram",
            "state": "closed",
            "is_available": true
          }
        }
      ]
    }
  },
  "summary": {
    "stt": {"current": "deepgram", "available_count": 2},
    "llm": {"current": "groq", "available_count": 2},
    "tts": {"current": "cartesia", "available_count": 2}
  }
}
```

#### Reset Provider Circuit Breaker
```http
POST /providers/{provider_type}/reset
```

**Parameters:**
- `provider_type`: One of `stt`, `llm`, `tts`

### Session Management

#### List Active Sessions
```http
GET /sessions
```

**Response:**
```json
{
  "count": 3,
  "sessions": [
    {
      "session_id": "uuid-here",
      "created_at": "2024-01-15T10:00:00Z",
      "last_activity": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Session Details
```http
GET /sessions/{session_id}
```

#### Delete Session
```http
DELETE /sessions/{session_id}
```

#### Cleanup All Sessions
```http
DELETE /sessions/cleanup
```

### Metrics

#### Get System Metrics
```http
GET /metrics
```

**Response:**
```json
{
  "session_count": 5,
  "total_requests": 1234,
  "average_latency_ms": 245,
  "error_rate": 0.02,
  "provider_stats": {
    "stt": {"requests": 500, "errors": 2},
    "llm": {"requests": 500, "errors": 5},
    "tts": {"requests": 500, "errors": 3}
  }
}
```

#### Get Recent Metrics
```http
GET /metrics/recent
```

### Cache Management

#### Get Cache Statistics
```http
GET /cache/stats
```

#### Clear Cache
```http
DELETE /cache/clear
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8000/voice/{session_id}')
```

### Message Format

All messages are JSON with a `type` field:

```json
{
  "type": "message_type",
  "data": { ... }
}
```

### Client → Server Messages

#### Send Audio
```json
{
  "type": "audio",
  "data": "base64-encoded-audio-data"
}
```

Audio should be:
- Format: PCM
- Sample rate: 16000 Hz
- Channels: Mono
- Bit depth: 16-bit

#### Send Interrupt (Barge-in)
```json
{
  "type": "interrupt"
}
```

### Server → Client Messages

#### State Change
```json
{
  "type": "state_change",
  "state": "listening"
}
```

States: `idle`, `listening`, `thinking`, `speaking`

#### Transcript Update
```json
{
  "type": "transcript_update",
  "data": {
    "id": "uuid",
    "speaker": "user",
    "text": "Hello, how are you?",
    "timestamp": 1705315800.123,
    "is_final": true
  }
}
```

#### Audio Response
```json
{
  "type": "audio",
  "data": "base64-encoded-audio-data"
}
```

#### Audio Metrics
```json
{
  "type": "audio_metrics",
  "data": {
    "rms": 0.045,
    "peak": 0.12,
    "snr_db": 25.5,
    "quality_score": 0.85,
    "quality_label": "Good",
    "duration_ms": 1500
  }
}
```

#### VAD Status
```json
{
  "type": "vad_status",
  "data": {
    "is_speech": true,
    "speech_ended": false
  }
}
```

#### Interrupt Acknowledgment
```json
{
  "type": "interrupt_ack",
  "message": "Playback stopped"
}
```

#### Error
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 404 | Not Found |
| 500 | Internal Server Error |

### Error Response Format
```json
{
  "detail": "Error message here"
}
```

## Rate Limiting

No rate limiting in development. In production:
- REST API: 100 requests/minute
- WebSocket: 50 messages/second

## CORS

Configured for:
- `http://localhost:3000` (development)
- Custom origins via `CORS_ORIGINS` env var

## Examples

### Complete Voice Session Flow

```javascript
// 1. Get auth token
const authResponse = await fetch('/auth/token', { method: 'POST' })
const { token, user_id } = await authResponse.json()

// 2. Connect WebSocket
const sessionId = crypto.randomUUID()
const ws = new WebSocket(`ws://localhost:8000/voice/${sessionId}`)

// 3. Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  
  switch (message.type) {
    case 'state_change':
      console.log('State:', message.state)
      break
    case 'transcript_update':
      console.log('Transcript:', message.data.text)
      break
    case 'audio':
      // Play audio
      playAudio(message.data)
      break
  }
}

// 4. Send audio
const audioRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
audioRecorder.ondataavailable = (e) => {
  const reader = new FileReader()
  reader.onload = () => {
    ws.send(JSON.stringify({
      type: 'audio',
      data: btoa(reader.result)
    }))
  }
  reader.readAsBinaryString(e.data)
}
audioRecorder.start(100) // 100ms chunks

// 5. Barge-in
function interrupt() {
  ws.send(JSON.stringify({ type: 'interrupt' }))
}

// 6. Disconnect
ws.close()
```

## Changelog

### v1.0.0
- Initial release
- Full voice conversation support
- Provider fallback system
- Real-time metrics

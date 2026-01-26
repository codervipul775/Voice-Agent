# Production-Ready Voice Assistant

A low-latency, multi-user voice assistant with real-time conversation capabilities, web search integration, and advanced features like barge-in support and conversation memory.

## 🎯 Features

### Core Capabilities
- **Natural Conversations**: Full-duplex audio with barge-in support (<500ms interrupt response)
- **Multi-User Support**: Concurrent sessions with isolated state
- **Real-Time Search**: Web search integration for current information
- **Conversation Memory**: Persistent history with semantic search
- **Live Captions**: Real-time transcripts with export functionality

### Reliability Features
- **Provider Fallback**: Automatic failover between AI providers
- **Circuit Breaker**: Protects against cascading failures
- **Smart Caching**: Semantic similarity-based response caching
- **Auto-Reconnection**: Exponential backoff for connection recovery

### Observability
- **Real-Time Metrics**: Dashboard with latency, throughput, and error rates
- **Audio Quality Monitoring**: SNR, peak levels, and quality scores
- **Structured Logging**: JSON logs with request tracing
- **Toast Notifications**: User-friendly error messages

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Voice Store │  │ Audio Hook  │  │  WebSocket Connection   │ │
│  │  (Zustand)  │  │  Recorder   │  │  (Real-time bidirectional)│
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend (FastAPI)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Provider Manager                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │  │
│  │  │   STT   │  │   LLM   │  │   TTS   │                  │  │
│  │  │Deepgram │  │  Groq   │  │Cartesia │                  │  │
│  │  │Assembly │  │ OpenAI  │  │ OpenAI  │                  │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘                  │  │
│  │       │            │            │                        │  │
│  │       └────────────┼────────────┘                        │  │
│  │                    │                                      │  │
│  │           Circuit Breaker Layer                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ Session Manager│  │ Metrics Store  │  │ Response Cache │   │
│  │    (Redis)     │  │    (Redis)     │  │    (Redis)     │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

**Backend:**
- Framework: FastAPI (Python 3.11+)
- Real-time: WebSockets
- Cache/Sessions: Redis
- Database: SQLite (dev) / PostgreSQL (prod)

**Frontend:**
- Framework: Next.js 14+ (App Router)
- State: Zustand
- Audio: Web Audio API + MediaRecorder
- UI: Tailwind CSS

**AI Providers:**
- STT: Deepgram (primary), AssemblyAI (fallback)
- LLM: Groq (primary), OpenAI (fallback)
- TTS: Cartesia (primary), OpenAI (fallback)
- Search: Tavily

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Redis (optional - uses in-memory fallback)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with backend URL

# Run development server
npm run dev
```

Visit http://localhost:3000 to start using the voice assistant!

## 🔑 API Keys Required

Get free API keys from:

| Provider | Purpose | Free Tier |
|----------|---------|-----------|
| [Deepgram](https://deepgram.com) | Speech-to-Text | $200 credit |
| [AssemblyAI](https://assemblyai.com) | STT Fallback | Free tier |
| [Groq](https://console.groq.com) | LLM (Llama) | Generous free tier |
| [OpenAI](https://platform.openai.com) | LLM/TTS Fallback | Pay-as-you-go |
| [Cartesia](https://cartesia.ai) | Text-to-Speech | Free tier |
| [Tavily](https://tavily.com) | Web Search | Free tier |

## 📊 Performance Metrics

| Metric | Target | Status |
|--------|--------|--------|
| System Init | <4s | ✅ |
| First Response | <3s | ✅ |
| Barge-In Response | <500ms | ✅ |
| Concurrent Users | 50+ | ✅ |
| WebSocket Latency | <100ms | ✅ |

## 🧪 Testing

### Unit & E2E Tests

```bash
# Backend tests
cd backend
pip install pytest pytest-asyncio
pytest tests/ -v

# Frontend type checking
cd frontend
npm run lint
```

### Load Testing

```bash
# Install Locust
pip install locust

# Run load tests (backend must be running)
cd backend
locust -f tests/test_load.py --host=http://localhost:8000

# Open http://localhost:8089 and configure:
# - Users: 50+
# - Spawn rate: 5/sec
```

## 📚 API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/health` | GET | Health check |
| `/providers` | GET | List AI providers |
| `/auth/token` | POST | Get auth token |
| `/sessions` | GET | List active sessions |
| `/metrics` | GET | System metrics |
| `/metrics/recent` | GET | Recent metrics |

### WebSocket

```
ws://localhost:8000/voice/{session_id}
```

**Message Types:**
- `state_change` - Voice state updates (idle/listening/thinking/speaking)
- `transcript_update` - Real-time transcription
- `audio` - Audio response chunks (base64)
- `audio_metrics` - Quality metrics
- `vad_status` - Voice activity detection
- `error` - Error messages

## 🔧 Configuration

### Environment Variables

```env
# Required
DEEPGRAM_API_KEY=your_key
GROQ_API_KEY=your_key
CARTESIA_API_KEY=your_key

# Optional (fallback providers)
ASSEMBLYAI_API_KEY=your_key
OPENAI_API_KEY=your_key

# Optional (features)
TAVILY_API_KEY=your_key
REDIS_URL=redis://localhost:6379

# Settings
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000
```

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up --build

# Production
docker-compose -f docker-compose.prod.yml up -d
```

## 📈 Monitoring

- **Metrics Dashboard**: Real-time latency, throughput, error rates
- **Audio Quality**: SNR, peak levels, quality scores
- **Provider Health**: Circuit breaker status, fallback counts
- **API Docs**: http://localhost:8000/docs (Swagger UI)

## 🤝 Contributing

Contributions welcome! Please read the project plan for development guidelines.

## 📄 License

MIT

---

Built with ❤️ using FastAPI, Next.js, and cutting-edge AI APIs
# Force redeploy Mon Jan 26 17:13:39 IST 2026

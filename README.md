# Production-Ready Voice Assistant

A low-latency, multi-user voice assistant with real-time conversation capabilities, web search integration, and advanced features like barge-in support and conversation memory.

## 🎯 Features

- **Natural Conversations**: Full-duplex audio with barge-in support (<500ms interrupt response)
- **Multi-User Support**: Concurrent sessions with isolated state
- **Real-Time Search**: Web search integration for current information
- **Conversation Memory**: Persistent history with semantic search
- **Live Captions**: Real-time transcripts with export
- **Smart Caching**: Semantic similarity-based response caching
- **Observability**: Real-time metrics dashboard with structured logging
- **Provider Fallback**: Automatic failover for reliability

## 🏗️ Architecture

### Backend

- **Framework**: FastAPI (Python 3.11+)
- **Communication**: WebSockets for full-duplex audio
- **Database**: PostgreSQL + Redis
- **AI Services**: Deepgram (STT), Groq (LLM), Cartesia (TTS), Tavily (Search)

### Frontend

- **Framework**: Next.js 14+ with TypeScript
- **Audio**: Web Audio API + MediaRecorder
- **State**: Zustand
- **UI**: Tailwind CSS + shadcn/ui

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL (or use Supabase free tier)
- Redis (or use Upstash free tier)

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

- [Deepgram](https://deepgram.com) - $200 free credit
- [Groq](https://console.groq.com) - Free tier
- [Cartesia](https://cartesia.ai) - Free tier
- [Tavily](https://tavily.com) - Free tier

## 📊 Performance Targets

| Metric           | Target | Achieved |
| ---------------- | ------ | -------- |
| System Init      | <4s    | ✅       |
| First Response   | <3s    | ✅       |
| Barge-In         | <500ms | ✅       |
| Concurrent Users | 10+    | ✅       |

## 📚 Documentation

- [Project Plan](./PROJECT_PLAN.md) - 10-day development schedule
- [API Documentation](http://localhost:8000/docs) - Auto-generated (when backend running)

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# Load testing
cd backend
locust -f tests/load_test.py
```

## 🐳 Docker Deployment

```bash
# Build and run with docker-compose
docker-compose up --build

# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

## 📈 Monitoring

Access the observability dashboard at:

- http://localhost:3000/dashboard - Real-time metrics
- http://localhost:8000/metrics - Backend metrics API

## 🤝 Contributing

This is a submission project, but feedback is welcome!

## 📄 License

MIT

---

Built with ❤️ using FastAPI, Next.js, and cutting-edge AI APIs

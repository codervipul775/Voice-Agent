"""
Database configuration and SQLAlchemy setup.
Uses SQLite for local development, can be switched to PostgreSQL for production.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from typing import AsyncGenerator

# Database URL - defaults to SQLite for local dev
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./voice_assistant.db")

# Convert postgres:// to postgresql:// for SQLAlchemy compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Determine connection args based on database type
connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}
else:
    # For PostgreSQL with asyncpg, handle SSL via query params (already in URL)
    # Remove sslmode from URL if present (asyncpg uses ssl param differently)
    if "sslmode=" in DATABASE_URL:
        # Extract sslmode and convert to asyncpg format
        import re
        # Fix: Ensure we don't leave a trailing ? or &
        DATABASE_URL = re.sub(r'[\?&]sslmode=[^&]*', '', DATABASE_URL)
        # Ensure the URL is still valid if we removed the last param
        DATABASE_URL = DATABASE_URL.rstrip('?&')
        connect_args = {"ssl": "require"}

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",
    pool_pre_ping=True,
    connect_args=connect_args, # Use connect_args for all engine types
)


# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables initialized")


async def close_db():
    """Close database connections."""
    await engine.dispose()
    print("🔌 Database connections closed")

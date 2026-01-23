"""
Conversation and Message models for persistent memory.
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.database import Base
import uuid


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Conversation(Base):
    """A conversation session with the voice assistant."""
    __tablename__ = "conversations"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    
    # Relationships
    messages: Mapped[List["Message"]] = relationship(
        "Message", 
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.timestamp"
    )
    summary: Mapped[Optional["ConversationSummary"]] = relationship(
        "ConversationSummary",
        back_populates="conversation",
        uselist=False,
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, session_id={self.session_id})>"


class Message(Base):
    """A single message in a conversation."""
    __tablename__ = "messages"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # 'user' or 'assistant'
    content: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    
    # Optional metadata
    audio_duration_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    used_search: Mapped[bool] = mapped_column(Boolean, default=False)
    search_query: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    
    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index('idx_messages_conv_time', 'conversation_id', 'timestamp'),
    )
    
    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role}, content={self.content[:30]}...)>"


class ConversationSummary(Base):
    """Summary and embedding for semantic search of conversations."""
    __tablename__ = "conversation_summaries"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), unique=True)
    summary: Mapped[str] = mapped_column(Text)
    key_topics: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)  # Store as JSON for SQLite compat
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="summary")
    
    def __repr__(self) -> str:
        return f"<ConversationSummary(id={self.id}, summary={self.summary[:50]}...)>"

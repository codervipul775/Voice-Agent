"""
Conversation Memory Service.
Handles saving, retrieving, and searching conversation history.
"""
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import async_session_maker
from app.models.conversation import Conversation, Message, ConversationSummary
from app.utils.embeddings import get_embedding, find_most_similar

logger = logging.getLogger(__name__)


class ConversationMemory:
    """
    Service for managing conversation memory.
    Provides methods for saving messages, retrieving history, and semantic search.
    """
    
    def __init__(self, session_id: str, user_id: Optional[str] = None):
        self.session_id = session_id
        self.user_id = user_id
        self._conversation_id: Optional[str] = None
    
    async def _get_or_create_conversation(self, db: AsyncSession) -> Conversation:
        """Get existing conversation or create a new one for this session."""
        # Try to find existing active conversation
        result = await db.execute(
            select(Conversation)
            .where(Conversation.session_id == self.session_id)
            .where(Conversation.is_active == True)
            .order_by(desc(Conversation.created_at))
            .limit(1)
        )
        conversation = result.scalar_one_or_none()
        
        if conversation:
            self._conversation_id = conversation.id
            return conversation
        
        # Create new conversation
        conversation = Conversation(
            session_id=self.session_id,
            user_id=self.user_id
        )
        db.add(conversation)
        await db.flush()
        self._conversation_id = conversation.id
        logger.info(f"📝 Created new conversation: {conversation.id}")
        return conversation
    
    async def save_message(
        self,
        role: str,
        content: str,
        audio_duration_ms: Optional[int] = None,
        latency_ms: Optional[int] = None,
        used_search: bool = False,
        search_query: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """
        Save a message to the conversation history.
        
        Args:
            role: 'user' or 'assistant'
            content: Message text content
            audio_duration_ms: Duration of audio in milliseconds
            latency_ms: Response latency in milliseconds
            used_search: Whether web search was used
            search_query: The search query if search was used
            metadata: Additional metadata
            
        Returns:
            The saved Message object
        """
        async with async_session_maker() as db:
            conversation = await self._get_or_create_conversation(db)
            
            message = Message(
                conversation_id=conversation.id,
                role=role,
                content=content,
                audio_duration_ms=audio_duration_ms,
                latency_ms=latency_ms,
                used_search=used_search,
                search_query=search_query,
                metadata_=metadata
            )
            db.add(message)
            
            # Update conversation timestamp
            conversation.updated_at = datetime.utcnow()
            
            await db.commit()
            logger.debug(f"💾 Saved {role} message: {content[:50]}...")
            return message
    
    async def get_history(
        self,
        limit: int = 20,
        include_metadata: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get conversation history for this session.
        
        Args:
            limit: Maximum number of messages to return
            include_metadata: Whether to include metadata in response
            
        Returns:
            List of message dictionaries with role and content
        """
        async with async_session_maker() as db:
            result = await db.execute(
                select(Message)
                .join(Conversation)
                .where(Conversation.session_id == self.session_id)
                .where(Conversation.is_active == True)
                .order_by(desc(Message.timestamp))
                .limit(limit)
            )
            messages = result.scalars().all()
            
            # Reverse to get chronological order
            messages = list(reversed(messages))
            
            history = []
            for msg in messages:
                entry = {
                    "role": msg.role,
                    "content": msg.content
                }
                if include_metadata:
                    entry["timestamp"] = msg.timestamp.isoformat()
                    entry["used_search"] = msg.used_search
                    entry["latency_ms"] = msg.latency_ms
                history.append(entry)
            
            return history
    
    async def get_context_messages(self, max_tokens: int = 4000) -> List[Dict[str, str]]:
        """
        Get recent messages formatted for LLM context.
        Automatically manages context window by estimating tokens.
        
        Args:
            max_tokens: Approximate maximum tokens to include
            
        Returns:
            List of messages in OpenAI format
        """
        history = await self.get_history(limit=50)
        
        # Simple token estimation (4 chars ≈ 1 token)
        messages = []
        total_chars = 0
        max_chars = max_tokens * 4
        
        for msg in reversed(history):
            msg_chars = len(msg["content"]) + 20  # Add overhead for role
            if total_chars + msg_chars > max_chars and messages:
                break
            messages.insert(0, {"role": msg["role"], "content": msg["content"]})
            total_chars += msg_chars
        
        return messages
    
    async def search_past_conversations(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Search past conversations using semantic similarity.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            threshold: Minimum similarity threshold
            
        Returns:
            List of relevant conversation excerpts with similarity scores
        """
        async with async_session_maker() as db:
            # Get all conversation summaries with embeddings
            result = await db.execute(
                select(ConversationSummary)
                .options(selectinload(ConversationSummary.conversation))
                .where(ConversationSummary.embedding.isnot(None))
            )
            summaries = result.scalars().all()
            
            if not summaries:
                return []
            
            # Get query embedding
            query_embedding = get_embedding(query)
            
            # Find similar conversations
            candidate_embeddings = [s.embedding for s in summaries]
            similar = find_most_similar(query_embedding, candidate_embeddings, top_k, threshold)
            
            results = []
            for idx, score in similar:
                summary = summaries[idx]
                results.append({
                    "conversation_id": summary.conversation_id,
                    "summary": summary.summary,
                    "key_topics": summary.key_topics,
                    "similarity": round(score, 3),
                    "created_at": summary.conversation.created_at.isoformat() if summary.conversation else None
                })
            
            return results
    
    async def summarize_and_store(self, llm_summarize_fn=None) -> Optional[ConversationSummary]:
        """
        Generate and store a summary of the current conversation.
        
        Args:
            llm_summarize_fn: Optional async function to generate summary using LLM
            
        Returns:
            The stored ConversationSummary or None
        """
        history = await self.get_history(limit=100)
        if len(history) < 3:
            return None
        
        async with async_session_maker() as db:
            conversation = await self._get_or_create_conversation(db)
            
            # Build conversation text
            conv_text = "\n".join([f"{m['role']}: {m['content']}" for m in history])
            
            # Generate summary (simple extraction if no LLM provided)
            if llm_summarize_fn:
                summary_text = await llm_summarize_fn(conv_text)
            else:
                # Simple summary: first user message + last assistant response
                user_msgs = [m for m in history if m['role'] == 'user']
                asst_msgs = [m for m in history if m['role'] == 'assistant']
                summary_text = f"User asked about: {user_msgs[0]['content'][:200] if user_msgs else 'N/A'}"
                if asst_msgs:
                    summary_text += f" AI responded: {asst_msgs[-1]['content'][:200]}"
            
            # Generate embedding
            embedding = get_embedding(summary_text)
            
            # Check if summary exists
            result = await db.execute(
                select(ConversationSummary)
                .where(ConversationSummary.conversation_id == conversation.id)
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.summary = summary_text
                existing.embedding = embedding
                existing.updated_at = datetime.utcnow()
                summary = existing
            else:
                summary = ConversationSummary(
                    conversation_id=conversation.id,
                    summary=summary_text,
                    embedding=embedding
                )
                db.add(summary)
            
            await db.commit()
            logger.info(f"📊 Stored conversation summary for {conversation.id}")
            return summary
    
    async def end_conversation(self):
        """Mark the current conversation as inactive."""
        async with async_session_maker() as db:
            result = await db.execute(
                select(Conversation)
                .where(Conversation.session_id == self.session_id)
                .where(Conversation.is_active == True)
            )
            conversation = result.scalar_one_or_none()
            
            if conversation:
                conversation.is_active = False
                await db.commit()
                logger.info(f"🔚 Ended conversation: {conversation.id}")


# Convenience function for quick access
async def get_memory(session_id: str, user_id: Optional[str] = None) -> ConversationMemory:
    """Get a ConversationMemory instance for a session."""
    return ConversationMemory(session_id=session_id, user_id=user_id)

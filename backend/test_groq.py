#!/usr/bin/env python3
import asyncio
import httpx
import json

async def test_groq():
    api_key = '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'
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'model': 'llama-3.1-70b-versatile',
        'messages': [
            {'role': 'system', 'content': 'You are helpful'},
            {'role': 'user', 'content': 'Say hello'}
        ],
        'temperature': 0.7,
        'max_tokens': 500
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers=headers,
                json=payload
            )
            print('Status:', response.status_code)
            print('Response:', json.dumps(response.json(), indent=2))
        except Exception as e:
            print('Error:', e)
            print('Response text:', response.text if 'response' in locals() else 'No response')

asyncio.run(test_groq())

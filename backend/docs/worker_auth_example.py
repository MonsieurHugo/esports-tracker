"""
Worker API Authentication Helper

This module provides utility functions for generating HMAC-SHA256 signatures
to authenticate requests from the Python worker to the AdonisJS backend.

Security features:
- HMAC-SHA256 signature prevents tampering
- Timestamp validation (60-second window) prevents delayed replay attacks
- UUID v4 nonce prevents replay attacks within the timestamp window

Usage:
    import httpx
    from worker_auth_example import generate_worker_auth

    # Example GET request
    timestamp, nonce, signature = generate_worker_auth(
        secret='your-worker-api-secret',
        method='GET',
        path='/api/v1/worker/status'
    )

    headers = {
        'X-Worker-Timestamp': timestamp,
        'X-Worker-Nonce': nonce,
        'X-Worker-Signature': signature
    }

    response = httpx.get('http://localhost:3333/api/v1/worker/status', headers=headers)

    # Example POST request with body
    body = {'player_id': 123, 'account_id': 456}
    timestamp, nonce, signature = generate_worker_auth(
        secret='your-worker-api-secret',
        method='POST',
        path='/api/v1/worker/update',
        body=body
    )

    headers = {
        'X-Worker-Timestamp': timestamp,
        'X-Worker-Nonce': nonce,
        'X-Worker-Signature': signature,
        'Content-Type': 'application/json'
    }

    response = httpx.post(
        'http://localhost:3333/api/v1/worker/update',
        headers=headers,
        json=body
    )
"""

import hmac
import hashlib
import time
import json
import uuid
from typing import Optional, Dict, Any, Tuple


def generate_worker_auth(
    secret: str,
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None
) -> Tuple[str, str, str]:
    """
    Generate authentication headers for worker API requests.

    Args:
        secret: The WORKER_API_SECRET from environment variables
        method: HTTP method (GET, POST, PUT, DELETE, etc.)
        path: Request path including query string (e.g., '/api/v1/worker/status?hours=24')
        body: Optional request body as a dictionary (for POST/PUT requests)

    Returns:
        Tuple of (timestamp, nonce, signature) to be used as headers:
        - X-Worker-Timestamp: Unix timestamp
        - X-Worker-Nonce: UUID v4 unique per request
        - X-Worker-Signature: HMAC-SHA256 signature

    Example:
        >>> timestamp, nonce, signature = generate_worker_auth(
        ...     secret='my-secret-key',
        ...     method='GET',
        ...     path='/api/v1/worker/status'
        ... )
        >>> print(f"X-Worker-Timestamp: {timestamp}")
        >>> print(f"X-Worker-Nonce: {nonce}")
        >>> print(f"X-Worker-Signature: {signature}")
    """
    # Generate current Unix timestamp
    timestamp = str(int(time.time()))

    # Generate unique nonce (UUID v4)
    nonce = str(uuid.uuid4())

    # Serialize body to JSON string (empty string if no body)
    body_str = json.dumps(body, separators=(',', ':')) if body else ''

    # Create payload: timestamp:nonce:method:path:body
    payload = f"{timestamp}:{nonce}:{method}:{path}:{body_str}"

    # Generate HMAC-SHA256 signature
    signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return timestamp, nonce, signature


# Backwards compatibility alias (deprecated)
def generate_worker_signature(
    secret: str,
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None
) -> Tuple[str, str]:
    """
    DEPRECATED: Use generate_worker_auth() instead.

    This function is kept for backwards compatibility but will be removed
    in a future version. The new API requires a nonce header.
    """
    import warnings
    warnings.warn(
        "generate_worker_signature() is deprecated. Use generate_worker_auth() which includes nonce.",
        DeprecationWarning,
        stacklevel=2
    )
    timestamp, nonce, signature = generate_worker_auth(secret, method, path, body)
    # Note: This won't work with the new middleware - just returns for compatibility
    return timestamp, signature


class WorkerAuthClient:
    """
    HTTP client wrapper with automatic worker authentication.

    This class wraps httpx.AsyncClient and automatically adds
    authentication headers (timestamp, nonce, signature) to all requests.

    Example:
        async with WorkerAuthClient(secret='my-secret', base_url='http://localhost:3333') as client:
            # GET request
            response = await client.get('/api/v1/worker/status')
            print(response.json())

            # POST request
            response = await client.post('/api/v1/worker/update', json={'player_id': 123})
            print(response.json())
    """

    def __init__(self, secret: str, base_url: str):
        """
        Initialize the authenticated client.

        Args:
            secret: The WORKER_API_SECRET from environment variables
            base_url: Base URL of the API (e.g., 'http://localhost:3333')
        """
        self.secret = secret
        self.base_url = base_url.rstrip('/')
        self._client: Optional[Any] = None

    async def __aenter__(self):
        """Async context manager entry."""
        import httpx
        self._client = httpx.AsyncClient(base_url=self.base_url)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()

    def _add_auth_headers(self, method: str, path: str, body: Optional[Dict] = None) -> Dict[str, str]:
        """Generate authentication headers for a request."""
        timestamp, nonce, signature = generate_worker_auth(
            secret=self.secret,
            method=method,
            path=path,
            body=body
        )
        return {
            'X-Worker-Timestamp': timestamp,
            'X-Worker-Nonce': nonce,
            'X-Worker-Signature': signature
        }

    async def get(self, path: str, **kwargs):
        """Make an authenticated GET request."""
        headers = self._add_auth_headers('GET', path)
        headers.update(kwargs.pop('headers', {}))
        return await self._client.get(path, headers=headers, **kwargs)

    async def post(self, path: str, json: Optional[Dict] = None, **kwargs):
        """Make an authenticated POST request."""
        headers = self._add_auth_headers('POST', path, body=json)
        headers.update(kwargs.pop('headers', {}))
        return await self._client.post(path, json=json, headers=headers, **kwargs)

    async def put(self, path: str, json: Optional[Dict] = None, **kwargs):
        """Make an authenticated PUT request."""
        headers = self._add_auth_headers('PUT', path, body=json)
        headers.update(kwargs.pop('headers', {}))
        return await self._client.put(path, json=json, headers=headers, **kwargs)

    async def patch(self, path: str, json: Optional[Dict] = None, **kwargs):
        """Make an authenticated PATCH request."""
        headers = self._add_auth_headers('PATCH', path, body=json)
        headers.update(kwargs.pop('headers', {}))
        return await self._client.patch(path, json=json, headers=headers, **kwargs)

    async def delete(self, path: str, **kwargs):
        """Make an authenticated DELETE request."""
        headers = self._add_auth_headers('DELETE', path)
        headers.update(kwargs.pop('headers', {}))
        return await self._client.delete(path, headers=headers, **kwargs)


# Example usage
if __name__ == '__main__':
    import asyncio

    async def main():
        # Example 1: Manual auth generation
        print("Example 1: Manual auth generation (with nonce)")
        print("-" * 50)
        timestamp, nonce, signature = generate_worker_auth(
            secret='my-secret-key',
            method='GET',
            path='/api/v1/worker/status'
        )
        print(f"X-Worker-Timestamp: {timestamp}")
        print(f"X-Worker-Nonce: {nonce}")
        print(f"X-Worker-Signature: {signature}")
        print()

        # Example 2: POST request with body
        print("Example 2: POST request with body")
        print("-" * 50)
        body = {'player_id': 123, 'account_id': 456}
        timestamp, nonce, signature = generate_worker_auth(
            secret='my-secret-key',
            method='POST',
            path='/api/v1/worker/update',
            body=body
        )
        print(f"X-Worker-Timestamp: {timestamp}")
        print(f"X-Worker-Nonce: {nonce}")
        print(f"X-Worker-Signature: {signature}")
        print(f"Body: {json.dumps(body)}")
        print()

        # Example 3: Using WorkerAuthClient (requires httpx)
        print("Example 3: Using WorkerAuthClient")
        print("-" * 50)
        print("(Uncomment the code below to test with a running server)")
        print()

        # Uncomment to test with actual API:
        """
        async with WorkerAuthClient(
            secret='your-worker-api-secret',
            base_url='http://localhost:3333'
        ) as client:
            try:
                response = await client.get('/api/v1/worker/status')
                print(f"Status: {response.status_code}")
                print(f"Response: {response.json()}")
            except Exception as e:
                print(f"Error: {e}")
        """

    asyncio.run(main())

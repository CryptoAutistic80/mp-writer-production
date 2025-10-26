/**
 * Centralized API client with automatic token refresh handling
 */

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
  skipCsrf?: boolean;
}

const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_ENDPOINT = '/api/auth/csrf-token';

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;
  private csrfToken: string | null = null;
  private csrfFetchPromise: Promise<string> | null = null;

  async request<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
    const { skipAuth = false, skipCsrf = false, ...fetchOptions } = options;
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    // Add credentials for authenticated requests
    if (!skipAuth) {
      fetchOptions.credentials = 'include';
    }

    if (isMutating && !skipCsrf && !skipAuth) {
      const token = await this.ensureCsrfToken();
      fetchOptions.headers = {
        ...fetchOptions.headers,
        [CSRF_HEADER_NAME]: token,
      };
    }

    let response = await fetch(url, fetchOptions);

    if (response.status === 403 && isMutating && !skipCsrf) {
      await this.refreshCsrfToken();
      const token = await this.ensureCsrfToken(true);
      fetchOptions.headers = {
        ...fetchOptions.headers,
        [CSRF_HEADER_NAME]: token,
      };
      response = await fetch(url, fetchOptions);
    }

    // Handle 401 Unauthorized responses
    if (response.status === 401 && !skipAuth) {
      // Try to refresh the token
      const refreshSuccess = await this.handleTokenRefresh();
      
      if (refreshSuccess) {
        // Retry the original request with new token
        response = await fetch(url, fetchOptions);
      } else {
        // Refresh failed, redirect to login
        this.redirectToLogin();
        throw new Error('Authentication failed. Please log in again.');
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed (${response.status})`);
    }

    return response.json().catch(() => null);
  }

  private async ensureCsrfToken(forceRefetch = false): Promise<string> {
    if (this.csrfToken && !forceRefetch) {
      return this.csrfToken;
    }

    if (this.csrfFetchPromise && !forceRefetch) {
      return this.csrfFetchPromise;
    }

    this.csrfFetchPromise = this.fetchCsrfToken();
    try {
      this.csrfToken = await this.csrfFetchPromise;
      return this.csrfToken;
    } finally {
      this.csrfFetchPromise = null;
    }
  }

  private async fetchCsrfToken(): Promise<string> {
    const response = await fetch(CSRF_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-store',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to obtain CSRF token');
    }

    const data = await response.json();
    if (!data?.csrfToken) {
      throw new Error('Invalid CSRF token response');
    }

    return data.csrfToken as string;
  }

  private async refreshCsrfToken(): Promise<void> {
    this.csrfToken = null;
    await this.ensureCsrfToken(true);
  }

  private async handleTokenRefresh(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    let result = false;
    try {
      result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
      if (!result) {
        this.csrfToken = null;
      }
    }
  }

  private async performTokenRefresh(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        this.csrfToken = null;
      }

      return response.ok;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.csrfToken = null;
      return false;
    }
  }

  private redirectToLogin(): void {
    // Redirect to Google OAuth login
    window.location.href = '/api/auth/google';
  }

  // Convenience methods
  async get<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T = any>(url: string, data?: any, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(url: string, data?: any, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };

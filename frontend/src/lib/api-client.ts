/**
 * Centralized API client with automatic token refresh handling
 */

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  async request<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    // Add credentials for authenticated requests
    if (!skipAuth) {
      fetchOptions.credentials = 'include';
    }

    let response = await fetch(url, fetchOptions);

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

  private async handleTokenRefresh(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'GET',
        credentials: 'include',
      });

      return response.ok;
    } catch (error) {
      console.error('Token refresh failed:', error);
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

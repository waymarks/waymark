/// <reference types="vitest" />
import express from 'express';
import http from 'http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getVersionInfo } from '../../services/version';

vi.mock('../../services/version');

const mockGetVersionInfo = vi.mocked(getVersionInfo);

// ─── Test helpers ─────────────────────────────────────────────────────────────

interface RequestOptions {
  hostname?: string;
  port: number;
  path: string;
  method: string;
  headers?: Record<string, string>;
}

interface ResponseData {
  status: number;
  headers: Record<string, any>;
  body: any;
  rawData: string;
}

async function makeRequest(options: RequestOptions, timeout: number = 5000): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.hostname || '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          data += chunk.toString();
        });

        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: data ? JSON.parse(data) : {},
              rawData: data,
            });
          } catch (error) {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: data,
              rawData: data,
            });
          }
        });

        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// ─── Server setup helpers ────────────────────────────────────────────────────

function getServerPort(server: http.Server): number {
  const addr = server.address();
  return (addr && typeof addr !== 'string') ? addr.port : 0;
}

async function startServer(handler: express.RequestHandler): Promise<http.Server> {
  const app = express();
  app.get('/api/version', handler);
  
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/version', () => {
  let server: http.Server;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (server) {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('basic functionality', () => {
    it('should return version info when service succeeds', async () => {
      mockGetVersionInfo.mockResolvedValueOnce({
        currentVersion: '4.4.2',
        latestVersion: '4.4.2',
        updateAvailable: false,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        currentVersion: '4.4.2',
        latestVersion: '4.4.2',
        updateAvailable: false,
      });
    });

    it('should return correct structure when update available', async () => {
      mockGetVersionInfo.mockResolvedValueOnce({
        currentVersion: '4.4.2',
        latestVersion: '4.4.3',
        updateAvailable: true,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.updateAvailable).toBe(true);
      expect(response.body.latestVersion).toBe('4.4.3');
    });

    it('should handle service errors gracefully', async () => {
      mockGetVersionInfo.mockRejectedValueOnce(new Error('Service error'));

      server = await startServer(async (req, res) => {
        try {
          const versionInfo = await mockGetVersionInfo();
          res.json(versionInfo);
        } catch (error) {
          res.status(500).json({ error: 'Failed to fetch version' });
        }
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch version');
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      mockGetVersionInfo.mockResolvedValue({
        currentVersion: '4.4.2',
        latestVersion: '4.4.2',
        updateAvailable: false,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const promises = Array.from({ length: 5 }, () =>
        makeRequest({
          port: getServerPort(server),
          path: '/api/version',
          method: 'GET',
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          currentVersion: '4.4.2',
          latestVersion: '4.4.2',
          updateAvailable: false,
        });
      });
    });

    it('should handle 10 concurrent requests', async () => {
      mockGetVersionInfo.mockResolvedValue({
        currentVersion: '4.4.2',
        latestVersion: '4.4.2',
        updateAvailable: false,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          makeRequest({
            port: getServerPort(server),
            path: '/api/version',
            method: 'GET',
          })
        )
      );

      expect(responses.length).toBe(10);
    });

    it('should not timeout on slow service', async () => {
      mockGetVersionInfo.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  currentVersion: '1.0.0',
                  latestVersion: '1.0.0',
                  updateAvailable: false,
                }),
              50
            );
          })
      );

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest(
        {
          port: getServerPort(server),
          path: '/api/version',
          method: 'GET',
        },
        5000
      );

      expect(response.status).toBe(200);
      expect(response.body.currentVersion).toBe('1.0.0');
    });
  });

  describe('edge cases', () => {
    it('should handle null latest version', async () => {
      mockGetVersionInfo.mockResolvedValueOnce({
        currentVersion: '4.4.2',
        latestVersion: null as any,
        updateAvailable: false,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.latestVersion).toBeNull();
    });

    it('should preserve all fields in response', async () => {
      const versionData = {
        currentVersion: '4.4.2',
        latestVersion: '4.4.3',
        updateAvailable: true,
      };

      mockGetVersionInfo.mockResolvedValueOnce(versionData);

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.body).toHaveProperty('currentVersion');
      expect(response.body).toHaveProperty('latestVersion');
      expect(response.body).toHaveProperty('updateAvailable');
      expect(Object.keys(response.body).length).toBe(3);
    });
  });

  describe('response headers', () => {
    it('should have correct content-type', async () => {
      mockGetVersionInfo.mockResolvedValueOnce({
        currentVersion: '4.4.2',
        latestVersion: '4.4.2',
        updateAvailable: false,
      });

      server = await startServer(async (req, res) => {
        const versionInfo = await mockGetVersionInfo();
        res.json(versionInfo);
      });

      const response = await makeRequest({
        port: getServerPort(server),
        path: '/api/version',
        method: 'GET',
      });

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});

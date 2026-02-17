import { describe, it, expect } from 'bun:test';
import {
  generateId,
  generateApiKey,
  generateSessionId,
  generateFileId,
  generateUserId,
  generateReportId,
  generateWebhookId,
} from '../../../src/server/utils/id';

describe('ID Generation', () => {
  describe('generateId', () => {
    it('should generate an ID with the given prefix', () => {
      const id = generateId('test');
      expect(id.startsWith('test_')).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('test'));
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs without dashes', () => {
      const id = generateId('test');
      expect(id.includes('-')).toBe(false);
    });

    it('should generate IDs of consistent length', () => {
      const id1 = generateId('prefix');
      const id2 = generateId('prefix');
      expect(id1.length).toBe(id2.length);
    });
  });

  describe('generateApiKey', () => {
    it('should generate an API key with proj_ prefix', () => {
      const key = generateApiKey();
      expect(key.startsWith('proj_')).toBe(true);
    });

    it('should generate unique API keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateSessionId', () => {
    it('should generate a session ID with sess_ prefix', () => {
      const id = generateSessionId();
      expect(id.startsWith('sess_')).toBe(true);
    });
  });

  describe('generateFileId', () => {
    it('should generate a file ID with file_ prefix', () => {
      const id = generateFileId();
      expect(id.startsWith('file_')).toBe(true);
    });
  });

  describe('generateUserId', () => {
    it('should generate a user ID with usr_ prefix', () => {
      const id = generateUserId();
      expect(id.startsWith('usr_')).toBe(true);
    });
  });

  describe('generateReportId', () => {
    it('should generate a report ID with rpt_ prefix', () => {
      const id = generateReportId();
      expect(id.startsWith('rpt_')).toBe(true);
    });
  });

  describe('generateWebhookId', () => {
    it('should generate a webhook ID with whk_ prefix', () => {
      const id = generateWebhookId();
      expect(id.startsWith('whk_')).toBe(true);
    });
  });
});

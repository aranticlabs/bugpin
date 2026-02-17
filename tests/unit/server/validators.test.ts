import { describe, it, expect } from 'bun:test';
import {
  isValidUrl,
  isValidEmail,
  isValidHexColor,
  validateSmtpConfig,
  validateS3Config,
  validateWithSchema,
} from '../../../src/server/utils/validators.js';
// Import z from the server's node_modules
import { z } from '../../../src/server/node_modules/zod/index.js';

describe('Validators', () => {
  describe('isValidUrl', () => {
    it('should return true for valid http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:7300')).toBe(true);
      expect(isValidUrl('http://example.com/path?query=1')).toBe(true);
    });

    it('should return true for valid https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://subdomain.example.com')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('//example.com')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('user @example.com')).toBe(false);
    });
  });

  describe('isValidHexColor', () => {
    it('should return true for valid hex colors', () => {
      expect(isValidHexColor('#FF0000')).toBe(true);
      expect(isValidHexColor('#00ff00')).toBe(true);
      expect(isValidHexColor('#123ABC')).toBe(true);
      expect(isValidHexColor('#abcdef')).toBe(true);
    });

    it('should return false for invalid hex colors', () => {
      expect(isValidHexColor('FF0000')).toBe(false); // Missing #
      expect(isValidHexColor('#FFF')).toBe(false); // 3 chars
      expect(isValidHexColor('#GGGGGG')).toBe(false); // Invalid chars
      expect(isValidHexColor('#FF00000')).toBe(false); // 7 chars
      expect(isValidHexColor('')).toBe(false);
    });
  });

  describe('validateSmtpConfig', () => {
    it('should return success for valid SMTP config', () => {
      const result = validateSmtpConfig({
        host: 'smtp.example.com',
        port: 587,
        from: 'noreply@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if host is missing', () => {
      const result = validateSmtpConfig({
        port: 587,
        from: 'noreply@example.com',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('INVALID_SMTP_CONFIG');
      }
    });

    it('should fail if host is empty', () => {
      const result = validateSmtpConfig({
        host: '',
        port: 587,
        from: 'noreply@example.com',
      });
      expect(result.success).toBe(false);
    });

    it('should fail if port is invalid', () => {
      const resultLow = validateSmtpConfig({
        host: 'smtp.example.com',
        port: 0,
        from: 'noreply@example.com',
      });
      expect(resultLow.success).toBe(false);

      const resultHigh = validateSmtpConfig({
        host: 'smtp.example.com',
        port: 99999,
        from: 'noreply@example.com',
      });
      expect(resultHigh.success).toBe(false);
    });

    it('should fail if from email is invalid', () => {
      const result = validateSmtpConfig({
        host: 'smtp.example.com',
        port: 587,
        from: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateS3Config', () => {
    it('should return success for valid S3 config', () => {
      const result = validateS3Config({
        bucket: 'my-bucket',
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if bucket is missing', () => {
      const result = validateS3Config({
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('INVALID_S3_CONFIG');
      }
    });

    it('should fail if region is missing', () => {
      const result = validateS3Config({
        bucket: 'my-bucket',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
      });
      expect(result.success).toBe(false);
    });

    it('should fail if accessKeyId is missing', () => {
      const result = validateS3Config({
        bucket: 'my-bucket',
        region: 'us-east-1',
        secretAccessKey: 'secret',
      });
      expect(result.success).toBe(false);
    });

    it('should fail if secretAccessKey is missing', () => {
      const result = validateS3Config({
        bucket: 'my-bucket',
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateWithSchema', () => {
    const testSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      age: z.number().int().min(0, 'Age must be non-negative'),
    });

    it('should return success for valid input', () => {
      const result = validateWithSchema(testSchema, { name: 'John', age: 30 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ name: 'John', age: 30 });
      }
    });

    it('should return failure with field name for invalid input', () => {
      const result = validateWithSchema(testSchema, { name: '', age: 30 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.error).toContain('name');
      }
    });

    it('should return failure for missing fields', () => {
      const result = validateWithSchema(testSchema, { name: 'John' });
      expect(result.success).toBe(false);
    });

    it('should return failure for wrong types', () => {
      const result = validateWithSchema(testSchema, { name: 'John', age: 'thirty' });
      expect(result.success).toBe(false);
    });
  });
});

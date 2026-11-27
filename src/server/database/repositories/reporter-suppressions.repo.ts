import { getDb } from '../database.js';
import type { ReporterSuppressionSource } from '@shared/types';

export const reporterSuppressionsRepo = {
  has(email: string): boolean {
    return (
      getDb().query('SELECT 1 FROM reporter_email_suppressions WHERE email = ?').get(email) !== null
    );
  },

  insert(email: string, source: ReporterSuppressionSource): void {
    getDb().run('INSERT OR IGNORE INTO reporter_email_suppressions (email, source) VALUES (?, ?)', [
      email,
      source,
    ]);
  },

  delete(email: string): void {
    getDb().run('DELETE FROM reporter_email_suppressions WHERE email = ?', [email]);
  },
};

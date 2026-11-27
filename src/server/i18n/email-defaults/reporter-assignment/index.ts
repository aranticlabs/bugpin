import type { ReporterTemplateDefaults } from '@shared/types';
import en from './en.js';
import de from './de.js';
import fr from './fr.js';
import nl from './nl.js';
import es from './es.js';
import it from './it.js';
import ja from './ja.js';
import ptBR from './pt-BR.js';
import zh from './zh.js';

export const reporterAssignment: ReporterTemplateDefaults = {
  en,
  de,
  fr,
  nl,
  es,
  it,
  ja,
  'pt-BR': ptBR,
  zh,
};

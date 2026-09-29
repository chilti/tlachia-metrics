/**
 * frontend/src/components/SuiteBar/SuiteBar.jsx
 * Envoltura de la Franja del Ecosistema Científico TlachIA
 */

import React from 'react';
import { TlachiaSuiteBar } from './TlachiaSuiteBar.jsx';
import { useI18n } from '../../i18n';

export function SuiteBar() {
  const { lang } = useI18n();

  return (
    <TlachiaSuiteBar
      currentApp="tlachia_metrics"
      lang={lang || 'es'}
    />
  );
}

export default SuiteBar;


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useCallback, useEffect, useState} from 'react';

interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

export const useApiKey = () => {
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  const validateApiKey = useCallback(async (): Promise<boolean> => {
    const aistudio = (window as any).aistudio as AIStudio | undefined;
    
    if (aistudio) {
      try {
        const hasKey = await aistudio.hasSelectedApiKey();
        if (!hasKey) {
          // setShowApiKeyDialog(true); // User requested to remove initial dialog
          return false;
        }
      } catch (error) {
        console.warn('API Key check failed', error);
        return false;
      }
    }
    return true;
  }, []);

  // Removed auto-check on mount to satisfy user request "убери запрос апи ключа на главной странице при запуске"

  const handleApiKeyDialogContinue = useCallback(async () => {
    setShowApiKeyDialog(false);
    const aistudio = (window as any).aistudio as AIStudio | undefined;
    if (aistudio) {
      await aistudio.openSelectKey();
    }
  }, []);

  return {
    showApiKeyDialog,
    setShowApiKeyDialog,
    validateApiKey,
    handleApiKeyDialogContinue,
  };
};

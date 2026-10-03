'use client';

import { DEFAULT_ERROR_MESSAGE } from '@feastpot/ui/user-error';
import { useEffect, useState } from 'react';

import { userErrorMessage } from './user-error-message';
export { userErrorMessage } from './user-error-message';

export function UserError({
  error,
  message = DEFAULT_ERROR_MESSAGE,
}: {
  error: unknown;
  message?: string;
}) {
  const [text, setText] = useState(`${message} Recording support reference...`);
  useEffect(() => {
    let active = true;
    setText(`${message} Recording support reference...`);
    void userErrorMessage(error, message).then((value) => {
      if (active) setText(value);
    });
    return () => {
      active = false;
    };
  }, [error, message]);
  return <span aria-live="polite">{text}</span>;
}

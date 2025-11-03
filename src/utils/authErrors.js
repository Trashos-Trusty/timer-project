export const SESSION_EXPIRED_MESSAGE = 'Votre session a expiré';
export const SESSION_EXPIRED_ERROR_CODE = 'AUTH_SESSION_EXPIRED';

const getErrorMessage = (error) => {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return '';
};

export const isSessionExpiredError = (error) => {
  if (!error) {
    return false;
  }

  if (typeof error === 'object' && error.isAuthError) {
    return true;
  }

  if (error?.status === 401) {
    return true;
  }

  const message = getErrorMessage(error);
  return message.includes(SESSION_EXPIRED_MESSAGE);
};

export const markSessionExpiredError = (error) => {
  if (error && typeof error === 'object') {
    error.isAuthError = true;

    if (typeof error.status === 'undefined') {
      error.status = 401;
    }

    if (typeof error.code === 'undefined') {
      error.code = SESSION_EXPIRED_ERROR_CODE;
    }

    return error;
  }

  const normalizedError = new Error(
    getErrorMessage(error) || SESSION_EXPIRED_MESSAGE
  );
  normalizedError.isAuthError = true;
  normalizedError.status = 401;
  normalizedError.code = SESSION_EXPIRED_ERROR_CODE;
  normalizedError.originalError = error;
  return normalizedError;
};

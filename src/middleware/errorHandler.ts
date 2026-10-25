export function notFoundHandler(request, response) {
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`,
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode || 500;
  if (statusCode === 500) {
    console.error(error);
  }
  response.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal server error." : error.message,
    ...(statusCode !== 500 && error.errors && { errors: error.errors }),
  });
}

/** `errors` carries field- or row-level details, e.g. [{ row, field, message }]. */
export function createHttpError(statusCode, message, errors) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (errors) error.errors = errors;
  return error;
}
export class ApiError extends Error{constructor(status,message,code='INTERNAL_SERVER_ERROR'){super(message);this.status=status;this.code=code}}

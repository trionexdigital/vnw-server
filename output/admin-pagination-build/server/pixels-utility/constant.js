"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
class Constants {
}
exports.Constants = Constants;
// ************ LABELS *****************
Constants.ACTIVE = 'ACTIVE';
// ************ COMMON CODES *****************
Constants.ZERO = 0;
Constants.SUCCESS = 1;
Constants.DEFAULT = -2;
Constants.ERROR = -3;
Constants.ERR_UNDEFINED = -4;
Constants.BLANK = -5;
Constants.NULL = -8;
Constants.EMPTY = -37;
// ************ AUTHENTICATION CODES *****************
Constants.AUTH_ERROR = -41;
Constants.AUTH_KEY_EXPIRED = -43;
Constants.AUTH_KEY_INVALID = -44;
Constants.AUTH_KEY_NOT_PASSED = -49;
// ************ DATABASE CODES *****************
Constants.DB_CONNECTION_ERROR = -80;
Constants.DB_QUERY_INVALID = -82;
Constants.DB_QUERY_ERROR = -83;
Constants.DB_QUERY_NO_RECORD_FOUND = -88;
// ******** HTTP STATUS CODES  *************
// #### 1xx Informational
Constants.HTTP_CONTINUE = 100;
Constants.HTTP_SWITCHING_PROTOCOLS = 101;
Constants.HTTP_PROCESSING_WEBDAV = 102;
// #### 2xx SUCCESS
Constants.HTTP_OK = 200;
Constants.HTTP_CREATED = 201;
Constants.HTTP_ACCEPTED = 202;
Constants.HTTP_NON_AUTHORITATIVE_INFORMATION = 203;
Constants.HTTP_NO_CONTENT = 204;
Constants.HTTP_RESET_CONTENT = 205;
Constants.HTTP_PARTIAL_CONTENT = 206;
Constants.HTTP_MULTI_STATUS_WEBDAV = 207;
Constants.HTTP_ALREADY_REPORTED_WEBDAV = 208;
Constants.HTTP_IM_USED = 226;
// #### 3xx Redirection
Constants.HTTP_MULTIPLE_CHOICES = 300;
Constants.HTTP_MOVED_PERMANENTLY = 301;
Constants.HTTP_FOUND = 302;
Constants.HTTP_SEE_OTHER = 303;
Constants.HTTP_NOT_MODIFIED = 304;
Constants.HTTP_USE_PROXY = 305;
Constants.HTTP_UNUSED = 306;
Constants.HTTP_TEMPORARY_REDIRECT = 307;
Constants.HTTP_PERMANENT_REDIRECT = 308;
// #### 4xx Client Error
Constants.HTTP_BAD_REQUEST = 400;
Constants.HTTP_UNAUTHORIZED = 401;
Constants.HTTP_PAYMENT_REQUIRED = 402;
Constants.HTTP_FORBIDDEN = 403;
Constants.HTTP_NOT_FOUND = 404;
Constants.HTTP_METHOD_NOT_ALLOWED = 405;
Constants.HTTP_NOT_ACCEPTABLE = 406;
Constants.HTTP_PROXY_AUTHENTICATION_REQUIRED = 407;
Constants.HTTP_REQUEST_TIMEOUT = 408;
Constants.HTTP_CONFLICT = 409;
Constants.HTTP_GONE = 410;
// #### 5xx Server Error
Constants.HTTP_INTERNAL_SERVER_ERROR = 500;
Constants.HTTP_NOT_IMPLEMENTED = 501;
Constants.HTTP_BAD_GATEWAY = 502;
//# sourceMappingURL=constant.js.map
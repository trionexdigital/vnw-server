export class Constants {
    // ************ LABELS *****************
    static ACTIVE: string = 'ACTIVE';

    // ************ COMMON CODES *****************
    static ZERO: number = 0;
    static SUCCESS: number = 1;
    static DEFAULT: number = -2;
    static ERROR: number = -3;
    static ERR_UNDEFINED: number = -4;
    static BLANK: number = -5;
    static NULL: number = -8;
    static EMPTY: number = -37;

    // ************ AUTHENTICATION CODES *****************
    static AUTH_ERROR: number = -41;
    static AUTH_KEY_EXPIRED: number = -43;
    static AUTH_KEY_INVALID: number = -44;
    static AUTH_KEY_NOT_PASSED: number = -49; 

    // ************ DATABASE CODES *****************
    static DB_CONNECTION_ERROR: number = -80;
    static DB_QUERY_INVALID: number = -82;
    static DB_QUERY_ERROR: number = -83;
    static DB_QUERY_NO_RECORD_FOUND: number = -88;
     
    // ******** HTTP STATUS CODES  *************
    // #### 1xx Informational
    static HTTP_CONTINUE: number = 100;
    static HTTP_SWITCHING_PROTOCOLS: number = 101;
    static HTTP_PROCESSING_WEBDAV: number = 102;
     
    // #### 2xx SUCCESS
    static HTTP_OK: number = 200;
    static HTTP_CREATED: number = 201;
    static HTTP_ACCEPTED: number = 202;
    static HTTP_NON_AUTHORITATIVE_INFORMATION: number = 203;
    static HTTP_NO_CONTENT: number = 204;
    static HTTP_RESET_CONTENT: number = 205;
    static HTTP_PARTIAL_CONTENT: number = 206;
    static HTTP_MULTI_STATUS_WEBDAV: number = 207;
    static HTTP_ALREADY_REPORTED_WEBDAV: number = 208;
    static HTTP_IM_USED: number = 226;

    // #### 3xx Redirection
    static HTTP_MULTIPLE_CHOICES: number = 300;
    static HTTP_MOVED_PERMANENTLY: number = 301;
    static HTTP_FOUND: number = 302;
    static HTTP_SEE_OTHER: number = 303;
    static HTTP_NOT_MODIFIED: number = 304;
    static HTTP_USE_PROXY: number = 305;
    static HTTP_UNUSED: number = 306;
    static HTTP_TEMPORARY_REDIRECT: number = 307;
    static HTTP_PERMANENT_REDIRECT: number = 308;

    // #### 4xx Client Error
    static HTTP_BAD_REQUEST: number = 400;
    static HTTP_UNAUTHORIZED: number = 401;
    static HTTP_PAYMENT_REQUIRED: number = 402;
    static HTTP_FORBIDDEN: number = 403;
    static HTTP_NOT_FOUND: number = 404;
    static HTTP_METHOD_NOT_ALLOWED: number = 405;
    static HTTP_NOT_ACCEPTABLE: number = 406;
    static HTTP_PROXY_AUTHENTICATION_REQUIRED: number = 407;
    static HTTP_REQUEST_TIMEOUT: number = 408;
    static HTTP_CONFLICT: number = 409;
    static HTTP_GONE: number = 410;

    // #### 5xx Server Error
    static HTTP_INTERNAL_SERVER_ERROR: number = 500;
    static HTTP_NOT_IMPLEMENTED: number = 501;
    static HTTP_BAD_GATEWAY: number = 502
}
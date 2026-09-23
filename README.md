# Node.js JWT Authentication

A modular JWT authentication backend built with **Node.js, Express, PostgreSQL, and Redis**.

This project demonstrates a secure authentication architecture using **short-lived access tokens**, **refresh-token rotation**, **server-side refresh-token state**, **refresh-token revocation**, **refresh-token reuse detection**, **HTTP-only cookies**, and **Redis-based login rate limiting**.

---

## Features

- User registration
- User login
- JWT access tokens
- JWT refresh tokens
- Short-lived access tokens
- HTTP-only refresh-token cookies
- Refresh-token rotation
- Refresh-token revocation
- Refresh-token reuse detection
- Redis-based refresh-token state
- PostgreSQL user persistence
- Redis-based login rate limiting
- IP-based rate limiting
- Account-based rate limiting
- Atomic Redis Lua rate-limiting operation
- Protected routes
- Logout
- Layered backend architecture

---

# Architecture

The application follows a layered backend architecture.

```mermaid
flowchart TD
    Client["Client"]

    Middleware["Middleware"]
    Controller["Controller"]
    Service["Service"]
    Repository["Repository"]

    PostgreSQL[("PostgreSQL")]
    Redis[("Redis")]

    Client --> Middleware
    Middleware --> Controller
    Controller --> Service
    Service --> Repository

    Repository --> PostgreSQL
    Repository --> Redis

    Service --> Redis
```

### Responsibilities

| Layer | Responsibility |
|---|---|
| Middleware | Authentication and rate limiting |
| Controller | HTTP request/response handling |
| Service | Authentication and business logic |
| Repository | PostgreSQL and Redis operations |
| Utils | JWT, hashing, and reusable helpers |
| PostgreSQL | Persistent user data |
| Redis | Refresh-token state and rate limiting |

---

# Project Structure

```text
node-jwt-authentication/
│
├── controllers/
│   ├── authController.js
│   └── userController.js
│
├── database/
│   └── db.js
│
├── middleware/
│   ├── loginRateLimiter.js
│   └── verifyAcces.js
│
├── repostiories/
│   ├── tokenRepository.js
│   └── userRepository.js
│
├── services/
│   ├── authService.js
│   ├── ratelimiterService.js
│   └── userService.js
│
├── utils/
│   ├── jwtUtils.js
│   ├── hashUtil.js
│   └── ratelimitUtil.js
│
├── redis/
│   ├── redisClient.js
│   └── scripts/
│       └── dualLeakyBucket.lua
│
├── app.js
├── package.json
├── package-lock.json
└── .gitignore
```

---

# Authentication Architecture

The project uses a hybrid authentication model.

The access token is **stateless**, while the refresh token has **server-side state stored in Redis**.

```mermaid
flowchart LR
    Auth["Authentication"]

    Auth --> Access["Access Token"]
    Auth --> Refresh["Refresh Token"]

    Access --> A1["JWT"]
    A1 --> A2["Short-lived"]
    A1 --> A3["API Authorization"]

    Refresh --> R1["JWT + tokenId"]
    R1 --> R2["HTTP-only Cookie"]
    R1 --> R3["Redis State"]
    R3 --> R4["Rotation"]
    R3 --> R5["Revocation"]
    R3 --> R6["Reuse Detection"]
```

This provides the scalability of stateless access tokens while maintaining server-side control over long-lived refresh tokens.

---

# Authentication Flow

The complete authentication lifecycle is:

```mermaid
flowchart TD
    Start["Client"]

    Register["POST /register"]
    Login["POST /login"]
    Protected["Protected API"]
    Refresh["POST /refresh"]
    Logout["POST /logout"]

    Start --> Register
    Register --> Login

    Login --> Protected

    Protected --> AccessValid{"Access Token Valid?"}

    AccessValid -->|Yes| Resource["Return Protected Resource"]
    AccessValid -->|No / Expired| Refresh

    Refresh --> RefreshValid{"Refresh Token Valid?"}

    RefreshValid -->|Yes| Rotate["Rotate Refresh Token"]
    Rotate --> Protected

    RefreshValid -->|No / Reused| Revoke["Revoke Refresh Tokens"]
    Revoke --> Login

    Resource --> Logout
    Logout --> End["Authentication Session Ended"]
```

---

# 1. Registration

The registration endpoint creates a new user.

```http
POST /register
Content-Type: application/json
```

Request:

```json
{
  "username": "john",
  "password": "password123"
}
```

### Registration Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant UC as User Controller
    participant US as User Service
    participant DB as PostgreSQL

    C->>UC: POST /register
    UC->>US: Register user
    US->>US: Hash password with bcrypt
    US->>DB: Insert user
    DB-->>US: User created
    US-->>UC: Registration result
    UC-->>C: Registration response
```

The password is hashed before it is stored in PostgreSQL.

```text
Password
   ↓
bcrypt
   ↓
Password Hash
   ↓
PostgreSQL
```

---

# 2. Login

The login endpoint is protected by the Redis-based rate limiter.

```http
POST /login
Content-Type: application/json
```

Request:

```json
{
  "username": "john",
  "password": "password123"
}
```

### Login Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant RL as Rate Limiter
    participant R as Redis
    participant AC as Auth Controller
    participant AS as Auth Service
    participant DB as PostgreSQL

    C->>RL: POST /login

    RL->>R: Check IP rate limit
    RL->>R: Check account rate limit
    R-->>RL: Rate-limit result

    alt Rate limit exceeded
        RL-->>C: 429 Too Many Requests
    else Request allowed
        RL->>AC: Continue request
        AC->>AS: Authenticate user
        AS->>DB: Find user
        DB-->>AS: User record
        AS->>AS: Compare password

        alt Invalid credentials
            AS-->>AC: Authentication failed
            AC-->>C: 401 Unauthorized
        else Valid credentials
            AS->>AS: Generate access token
            AS->>AS: Generate refresh token
            AS->>R: Store refresh-token state
            R-->>AS: Token state stored
            AS-->>AC: Authentication result
            AC-->>C: Access token + HTTP-only refresh cookie
        end
    end
```

### Important

IP and account identifiers are used for **rate limiting**, not as authentication identity checks.

The login process does not compare the current IP/User-Agent against a previous session.

---

# 3. Access Token

The access token is a short-lived JWT used to authorize protected API requests.

The current implementation uses a **15-minute expiration**.

Example payload:

```json
{
  "userId": "...",
  "username": "...",
  "iat": "...",
  "exp": "..."
}
```

The access token is signed using:

```text
ACCESS_SECRET_KEY
```

### Access Token Characteristics

```text
JWT
 ↓
Stateless
 ↓
Short-lived
 ↓
Used for API authorization
```

Because the access token is short-lived, the impact of a stolen access token is limited by its expiration time.

---

# 4. Refresh Token

The refresh token is used to obtain a new access token after the access token expires.

The current implementation uses a **7-day expiration**.

Each refresh token contains a unique `tokenId`.

The token is signed using:

```text
REFRESH_SECRET_KEY
```

The refresh token is stored in an HTTP-only cookie.

The server stores the corresponding refresh-token state in Redis.

### Redis Key

```text
refresh:<tokenId>
```

### Example Redis State

```json
{
  "userId": 123,
  "valid": true
}
```

The refresh-token record is temporary state and can expire automatically through Redis TTL.

---

# 5. Accessing Protected Routes

Protected routes require an access token.

Example:

```http
GET /home
Authorization: Bearer <access-token>
```

### Protected Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Auth Middleware
    participant API as Protected Route

    C->>M: Request + Bearer Token
    M->>M: Extract access token
    M->>M: Verify JWT

    alt Invalid or expired token
        M-->>C: Authentication error
    else Valid token
        M->>M: Attach decoded payload to req.user
        M->>API: Continue request
        API-->>C: Protected resource
    end
```

The access token can be verified without querying Redis for every protected request.

---

# 6. Refresh Token Flow

When the access token expires, the client sends:

```http
POST /refresh
```

The browser sends the refresh token through the HTTP-only cookie.

### Refresh Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as Refresh Endpoint
    participant AS as Auth Service
    participant R as Redis

    C->>API: POST /refresh
    API->>AS: Refresh token from cookie

    AS->>AS: Verify refresh JWT
    AS->>R: Lookup tokenId
    R-->>AS: Token state

    alt Token invalid or missing
        AS-->>C: Reject refresh request
    else Token valid
        AS->>R: Invalidate old refresh token
        AS->>AS: Generate new access token
        AS->>AS: Generate new refresh token
        AS->>R: Store new refresh-token state
        AS-->>API: New access token
        API-->>C: New access token + refresh cookie
    end
```

---

# 7. Refresh Token Rotation

Refresh-token rotation means that a refresh token is invalidated when it is successfully used.

```mermaid
flowchart TD
    Old["Refresh Token A"]

    Validate["Validate JWT + Redis State"]
    Invalidate["Invalidate Token A"]

    NewAccess["Generate New Access Token"]
    NewRefresh["Generate Refresh Token B"]
    Store["Store Token B in Redis"]

    Old --> Validate
    Validate --> Invalidate

    Invalidate --> NewAccess
    Invalidate --> NewRefresh
    NewRefresh --> Store
```

The lifecycle becomes:

```text
Refresh Token A
       ↓
      Use
       ↓
   Invalidate
       ↓
Refresh Token B
       ↓
      Use
       ↓
Refresh Token C
```

This prevents the same refresh token from being continuously reused.

---

# 8. Refresh Token Reuse Detection

Refresh-token rotation also enables reuse detection.

Consider this scenario:

```text
                     Refresh Token A
                           │
                ┌──────────┴──────────┐
                │                     │
          Legitimate Client       Attacker
                │                     │
                ▼                     │
              Uses A                  │
                │                     │
                ▼                     │
          A invalidated               │
                │                     │
                ▼                     │
          Token B issued              │
                                      │
                                      ▼
                                Attempts A
                                      │
                                      ▼
                              A is invalid
                                      │
                                      ▼
                              Reuse detected
```

### Reuse Detection Flow

```mermaid
flowchart TD
    Request["Refresh Request"]

    Verify["Verify Refresh JWT"]
    Lookup["Lookup tokenId in Redis"]

    Valid{"Token valid?"}

    Rotate["Rotate Token"]
    NewToken["Issue New Token Pair"]

    Reuse["Possible Token Reuse"]
    Revoke["Revoke User Refresh Tokens"]
    Reject["Reject Request"]

    Request --> Verify
    Verify --> Lookup
    Lookup --> Valid

    Valid -->|Yes| Rotate
    Rotate --> NewToken

    Valid -->|No| Reuse
    Reuse --> Revoke
    Revoke --> Reject
```

When a previously invalidated refresh token is presented again, the application can treat it as a potential compromise and revoke the user's refresh-token state.

---

# 9. Logout

The logout endpoint requires a valid access token.

```http
POST /logout
Authorization: Bearer <access-token>
```

### Logout Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Auth Middleware
    participant AC as Auth Controller
    participant AS as Auth Service
    participant R as Redis

    C->>M: POST /logout + Access Token
    M->>M: Verify Access Token
    M->>AC: Authenticated request
    AC->>AS: Logout user
    AS->>R: Revoke refresh tokens
    R-->>AS: Revocation complete
    AS-->>AC: Logout successful
    AC-->>C: Clear refresh cookie
```

After logout, previously issued refresh tokens are no longer usable.

---

# 10. Login Rate Limiting

The login endpoint uses Redis-based rate limiting to protect against excessive authentication attempts.

The limiter considers two dimensions:

```text
IP Address
+
Account Identifier
```

### Rate Limiting Flow

```mermaid
flowchart TD
    Login["POST /login"]

    Middleware["Login Rate Limiter"]

    IP["IP Rate Limit"]
    Account["Account Rate Limit"]

    Redis[("Redis")]

    Decision{"Request Allowed?"}

    Continue["Continue Login"]
    Reject["429 Too Many Requests"]

    Login --> Middleware

    Middleware --> IP
    Middleware --> Account

    IP --> Redis
    Account --> Redis

    Redis --> Decision

    Decision -->|Yes| Continue
    Decision -->|No| Reject
```

---

# 11. IP-Based Rate Limiting

The client IP is used as one of the rate-limit dimensions.

Example Redis key:

```text
rate_limit:login:ip:<ip>
```

The purpose of the IP address here is:

- Prevent brute-force attacks
- Limit repeated login attempts
- Reduce abuse
- Protect the authentication endpoint

It is **not used as a trusted device identity**.

---

# 12. Account-Based Rate Limiting

The account identifier is also used for rate limiting.

Example:

```text
rate_limit:login:account:<hashed-account>
```

The account identifier is hashed before being used in the Redis key.

This protects against attacks where a single account is repeatedly targeted from different IP addresses.

### Combined Protection

```mermaid
flowchart LR
    Request["Login Request"]

    IP["IP Limiter"]
    Account["Account Limiter"]

    IPDecision{"IP Allowed?"}
    AccountDecision{"Account Allowed?"}

    Login["Authentication"]
    Reject["429 Too Many Requests"]

    Request --> IP
    IP --> IPDecision

    IPDecision -->|No| Reject
    IPDecision -->|Yes| Account

    Account --> AccountDecision

    AccountDecision -->|No| Reject
    AccountDecision -->|Yes| Login
```

---

# 13. Redis Lua Rate Limiting

The rate-limiting operation is executed using a Redis Lua script.

Using a Lua script allows the related Redis operations to execute atomically.

```mermaid
sequenceDiagram
    participant API as Node.js
    participant Service as Rate Limit Service
    participant Redis as Redis
    participant Lua as Lua Script

    API->>Service: Check login rate limit
    Service->>Redis: Execute Lua script
    Redis->>Lua: Run rate-limit logic

    Lua->>Lua: Read current state
    Lua->>Lua: Calculate rate
    Lua->>Lua: Update state
    Lua->>Lua: Calculate remaining capacity

    Lua-->>Redis: Result
    Redis-->>Service: Limit information
    Service-->>API: Allow / Reject
```

---

# 14. Rate Limit Response

When the login rate limit is exceeded:

```http
429 Too Many Requests
```

Example response:

```json
{
  "success": false,
  "message": "too many login requests"
}
```

The middleware also provides rate-limit information through response headers.

Examples include:

```text
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
```

---

# 15. PostgreSQL

PostgreSQL is used for persistent user data.

The application uses a `users` table containing authentication-related information.

Example schema:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL
);
```

Passwords are stored as bcrypt hashes.

---

# 16. Redis

Redis is used for temporary and high-speed authentication state.

Redis stores:

### Refresh Token State

```text
refresh:<tokenId>
```

### Login Rate-Limit State

```text
rate_limit:login:ip:<ip>
```

```text
rate_limit:login:account:<hashed-account>
```

The refresh-token state can automatically expire using Redis TTL.

---

# 17. Data Flow

```mermaid
flowchart TB
    Client["Client"]

    subgraph Express["Node.js / Express"]
        Routes["Routes"]
        Middleware["Middleware"]
        Controllers["Controllers"]
        Services["Services"]
        Utils["Utilities"]
        Repositories["Repositories"]
    end

    PostgreSQL[("PostgreSQL")]
    Redis[("Redis")]

    Client --> Routes
    Routes --> Middleware
    Middleware --> Controllers
    Controllers --> Services

    Services --> Utils
    Services --> Repositories

    Repositories --> PostgreSQL
    Repositories --> Redis

    Middleware --> Redis
```

---

# 18. Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Issued

    Issued --> Active: Login

    Active --> Rotated: Refresh
    Rotated --> Active: New token issued

    Active --> Revoked: Logout
    Active --> Revoked: Reuse detected
    Active --> Expired: TTL expires

    Revoked --> [*]
    Expired --> [*]
```

---

# Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend framework |
| PostgreSQL | Persistent user storage |
| Redis | Refresh-token state and rate limiting |
| ioredis | Redis client |
| JSON Web Token | Access and refresh tokens |
| bcrypt | Password hashing |
| cookie-parser | Cookie handling |
| dotenv | Environment configuration |
| UUID | Token identifiers |
| Axios | HTTP client |

---

# Environment Variables

Create a `.env` file in the project root.

```env
ACCESS_SECRET_KEY=your_access_secret_key
REFRESH_SECRET_KEY=your_refresh_secret_key

Dbhost=localhost
Dbuser=postgres
Dbport=5432
Dbpass=your_postgres_password
Dbdatabase=your_database_name
```

## Secret Key Security

Never commit `.env` to Git.

Use strong, cryptographically random values for:

```text
ACCESS_SECRET_KEY
REFRESH_SECRET_KEY
```

Keep access-token and refresh-token signing keys separate.

---

# Prerequisites

Install:

- Node.js
- npm
- PostgreSQL
- Redis

Verify Node.js:

```bash
node --version
```

Verify npm:

```bash
npm --version
```

Verify PostgreSQL:

```bash
psql --version
```

Verify Redis:

```bash
redis-server --version
```

---

# Installation

Clone the repository:

```bash
git clone https://github.com/ShanmukhaKommuri/node-jwt-authentication.git
```

Navigate to the project:

```bash
cd node-jwt-authentication
```

Install dependencies:

```bash
npm install
```

Create the PostgreSQL database.

Create the `users` table.

Configure the `.env` file.

Start Redis:

```bash
redis-server
```

Start the application:

```bash
npm run dev
```

The application runs on:

```text
http://localhost:3000
```

---

# API Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Register a new user |
| `POST` | `/login` | Public + Rate Limited | Authenticate user |
| `POST` | `/refresh` | Refresh Cookie | Rotate refresh token |
| `POST` | `/logout` | Access Token | Revoke refresh tokens |
| `GET` | `/home` | Access Token | Protected resource |

---

# API Examples

## Register

```http
POST /register
Content-Type: application/json
```

```json
{
  "username": "john",
  "password": "password123"
}
```

---

## Login

```http
POST /login
Content-Type: application/json
```

```json
{
  "username": "john",
  "password": "password123"
}
```

Successful response:

```json
{
  "accessToken": "<access-token>"
}
```

The refresh token is sent through an HTTP-only cookie.

---

## Protected Endpoint

```http
GET /home
Authorization: Bearer <access-token>
```

Example response:

```json
{
  "message": "Welcome john"
}
```

---

## Refresh

```http
POST /refresh
```

The browser sends the refresh-token cookie.

The server:

1. Verifies the refresh JWT.
2. Extracts the token ID.
3. Looks up the token in Redis.
4. Checks whether the token is valid.
5. Invalidates the existing token.
6. Creates a new access token.
7. Creates a new refresh token.
8. Stores the new refresh-token state in Redis.
9. Sends the new refresh token through the HTTP-only cookie.

---

## Logout

```http
POST /logout
Authorization: Bearer <access-token>
```

The server revokes refresh-token state and clears the refresh-token cookie.

---

# Security Model

The project uses multiple security mechanisms.

```mermaid
flowchart TD
    Password["Password"]
    Hash["bcrypt"]

    Access["Short-lived Access Token"]

    Refresh["Refresh Token"]
    Cookie["HTTP-only Cookie"]
    Redis["Redis Token State"]

    Rotation["Refresh Rotation"]
    Revocation["Token Revocation"]
    Reuse["Reuse Detection"]

    Rate["Login Rate Limiting"]
    IP["IP"]
    Account["Account"]

    Password --> Hash

    Refresh --> Cookie
    Refresh --> Redis

    Redis --> Rotation
    Redis --> Revocation
    Redis --> Reuse

    Rate --> IP
    Rate --> Account
```

### Security controls

1. Password hashing with bcrypt
2. Short-lived access tokens
3. HTTP-only refresh-token cookies
4. Separate access and refresh signing secrets
5. Refresh-token rotation
6. Server-side refresh-token state
7. Refresh-token revocation
8. Refresh-token reuse detection
9. Redis-based login rate limiting
10. IP-based login protection
11. Account-based login protection

---

# Why Use Short-Lived Access Tokens?

If an access token is long-lived and stolen, the attacker can use it until it expires.

Using a short-lived token reduces the exposure window.

```text
Login
  ↓
Access Token
  ↓
15 minutes
  ↓
Expires
  ↓
Refresh Token
  ↓
New Access Token
```

---

# Why Use Redis for Refresh Tokens?

JWT access tokens are stateless, but long-lived refresh tokens require more control.

Redis allows the application to:

- Track refresh-token validity
- Rotate tokens
- Revoke tokens
- Detect reuse
- Expire token state automatically
- Revoke all refresh tokens for a user

Therefore:

```text
Access Token
    ↓
Stateless JWT
    ↓
Fast authorization


Refresh Token
    ↓
JWT + tokenId
    ↓
Redis
    ↓
Stateful control
```

---

# Why Use Refresh Token Rotation?

Without rotation:

```text
Refresh Token
      ↓
Valid for 7 days
      ↓
Can repeatedly be used
```

With rotation:

```text
Refresh Token A
      ↓
     Use
      ↓
Invalidate A
      ↓
Issue B
      ↓
     Use
      ↓
Invalidate B
      ↓
Issue C
```

This significantly improves control over long-lived refresh credentials.

---

# Why Use Login Rate Limiting?

Authentication endpoints are common targets for:

- Brute-force attacks
- Credential stuffing
- Password spraying
- Automated login attempts
- Account targeting

Using both IP and account-based rate limits provides two layers of protection.

```text
                    Login
                      │
            ┌─────────┴─────────┐
            │                   │
        IP limit           Account limit
            │                   │
            └─────────┬─────────┘
                      │
                  Allowed?
                 /        \
               Yes         No
                │           │
             Login         429
```

---

# Error Responses

## Invalid Credentials

```http
401 Unauthorized
```

```json
{
  "message": "Invalid credentials"
}
```

## Missing Access Token

```http
401 Unauthorized
```

## Invalid or Expired Access Token

```http
403 Forbidden
```

## Refresh Token Reuse

```http
403 Forbidden
```

```json
{
  "message": "Refresh token reuse detected"
}
```

## Rate Limit Exceeded

```http
429 Too Many Requests
```

```json
{
  "success": false,
  "message": "too many login requests"
}
```

---

# Design Principles

## Separation of Concerns

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
PostgreSQL / Redis
```

Each layer has a specific responsibility.

## Stateless Access Authentication

Access tokens can be verified without performing a database lookup for every protected request.

## Stateful Refresh Authentication

Refresh tokens have server-side state in Redis.

This allows the application to control their lifecycle.

## Defense in Depth

The system does not depend on a single security mechanism.

```text
bcrypt
  +
JWT
  +
HTTP-only Cookies
  +
Redis
  +
Rotation
  +
Revocation
  +
Reuse Detection
  +
Rate Limiting
```

---

# Learning Objectives

This project demonstrates practical implementation of:

- JWT authentication
- Access tokens
- Refresh tokens
- Stateless authentication
- Stateful authentication
- Refresh-token rotation
- Refresh-token revocation
- Refresh-token reuse detection
- HTTP-only cookies
- Password hashing
- Redis
- PostgreSQL
- Express middleware
- Repository pattern
- Service-layer architecture
- Redis-based rate limiting
- Lua scripting
- Authentication security

---

# Project Status

**Learning / Portfolio Project**

This project was created to understand and implement modern authentication patterns using Node.js, Express, PostgreSQL, and Redis.

---

# Author

**Shanmukha Kommuri**

GitHub:

https://github.com/ShanmukhaKommuri

Repository:

https://github.com/ShanmukhaKommuri/node-jwt-authentication

---

# License

This project is licensed under the **ISC License**.

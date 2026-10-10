# Sentinel --- Technical Requirements Document

**Version:** 1.0\
**Status:** Draft

## 1. Architecture

``` text
Dashboard
    |
Sentinel API
    |
    +---- Policy Engine
    |
    +---- Decision Engine
              |
              +---- Laya
    |
Decision
  +---- ALLOW
  +---- REVIEW
  +---- BLOCK
```

## 2. Recommended Stack

### Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui selectively
-   TanStack Query
-   React Hook Form

### Backend

-   TypeScript
-   Node.js
-   Fastify

### Database

-   PostgreSQL
-   Drizzle ORM

### Cache / Queue

-   Redis

## 3. Core Domain Model

### Agent

``` typescript
type Agent = {
  id: string;
  name: string;
  description?: string;
  status: "active" | "disabled";
  createdAt: Date;
};
```

### Tool

``` typescript
type Tool = {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
};
```

### Policy

``` typescript
type Policy = {
  id: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  mode: "block" | "review" | "audit";
  enabled: boolean;
  version: number;
};
```

### Action

``` typescript
type Action = {
  id: string;
  agentId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  context: Record<string, unknown>;
  createdAt: Date;
};
```

### Decision

``` typescript
type Decision = {
  id: string;
  actionId: string;
  outcome: "allow" | "review" | "block";
  confidence?: number;
  reason?: string;
  policyIds: string[];
  createdAt: Date;
};
```

### Judgment

``` typescript
type Judgment = {
  id: string;
  decisionId: string;
  question: string;
  type: "noul" | "choice" | "score";
  answer: unknown;
  probabilities?: Record<string, number>;
  confidence?: number;
};
```

## 4. Evaluation Pipeline

``` text
POST /v1/actions/evaluate
        |
Validate
        |
Authenticate agent
        |
Load policies
        |
Deterministic checks
        |
Build evaluation state
        |
Call Laya
        |
Validate response
        |
Apply thresholds
        |
ALLOW / REVIEW / BLOCK
```

## 5. Deterministic Checks

Use ordinary code for: - exact permissions - allowlists/denylists -
arithmetic - date comparisons - database existence - authentication -
cryptographic verification - exact thresholds

Never ask an AI model a question that code can answer exactly.

## 6. Laya Integration

Laya is the contextual judgment layer. Sentinel should construct focused
questions around a supplied state rather than asking a vague question
such as "Should we allow this?"

Example conceptual state:

``` json
{
  "agent": "research-agent",
  "task": "Research competitors",
  "action": {
    "tool": "send_email",
    "arguments": {
      "recipient": "external@example.com",
      "attachment": "customers.csv"
    }
  },
  "policies": [
    "Customer data must never be sent externally."
  ]
}
```

Questions: - Does the action expose sensitive customer information? -
Does it violate a supplied policy? - Should a human review it? - Is it
destructive?

Keep the Laya API key server-side.

## 7. Confidence

Confidence is a signal, not truth.

Suggested initial thresholds:

``` yaml
thresholds:
  high_confidence: 0.90
  review_below: 0.80
```

Example: - 0.97 violation -\> BLOCK - 0.84 violation -\> REVIEW - 0.21
violation -\> continue other checks

Thresholds must be configurable.

## 8. Decision Precedence

``` text
BLOCK > REVIEW > ALLOW
```

If any independent policy requires blocking, the final decision is
BLOCK.

## 9. API

### Evaluate

``` http
POST /v1/actions/evaluate
```

Example response:

``` json
{
  "decision": "review",
  "confidence": 0.91,
  "reason": "External communication requires human approval.",
  "decisionId": "dec_123"
}
```

### Approvals

``` http
GET  /v1/approvals
POST /v1/approvals/:id/approve
POST /v1/approvals/:id/reject
```

### Policies

``` http
GET    /v1/policies
POST   /v1/policies
GET    /v1/policies/:id
PATCH  /v1/policies/:id
DELETE /v1/policies/:id
```

### Decisions

``` http
GET /v1/decisions
GET /v1/decisions/:id
```

## 10. Security

-   Never expose the Laya key to the browser.
-   Treat external text as untrusted data.
-   Redact secrets before persistence.
-   Avoid storing complete sensitive payloads by default.
-   Use explicit retention settings.
-   Fail closed for consequential actions when Laya is unavailable unless
    a documented low-risk fallback applies.

## 11. Failure Handling

Laya unavailable: - high risk -\> BLOCK - medium risk -\> REVIEW - low
risk -\> configurable

Laya timeout: - one retry - then fallback policy

Malformed response: - treat as evaluation failure - never interpret
invalid output as permission

## 12. Observability

Record: - request_id - decision_id - agent_id - tool - policy_ids -
evaluation_duration - provider_duration - decision - confidence -
fallback_used

Metrics: - decisions_total - allow_total - review_total - block_total -
provider_errors_total - provider_latency - approval_latency - policy_match_rate

## 13. Testing

Include: - normal cases - dangerous cases - ambiguous cases - prompt
injection - social engineering - malicious documents - misleading tool
output - credential exfiltration - production deletion - unauthorized
payments

## 14. Repository Structure

``` text
sentinel/
├── apps/
│   ├── dashboard/
│   └── api/
├── packages/
│   ├── policy-engine/
│   ├── decision-engine/
│   ├── judgment-provider/
│   ├── agent-sdk/
│   ├── schemas/
│   └── logger/
├── tests/
│   ├── policies/
│   ├── decisions/
│   ├── adversarial/
│   └── integration/
├── docs/
├── PRD.md
├── TRD.md
├── AGENTS.md
└── DESIGN.md
```

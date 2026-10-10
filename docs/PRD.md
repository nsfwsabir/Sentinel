# Sentinel --- Product Requirements Document

**Status:** Draft\
**Version:** 1.0\
**Product:** Sentinel\
**Tagline:** Runtime policy enforcement for AI agents

## 1. Product Overview

Sentinel is a runtime security and policy layer for autonomous AI
agents.

AI agents can increasingly read information, call APIs, modify files,
interact with databases, send messages, make purchases, deploy
applications, and execute code.

The core problem is:

> Should this particular action be allowed right now, given the agent's
> task, permissions, policies, context, and evidence?

Sentinel sits between an AI agent and its tools.

``` text
AI Agent
   |
Proposed action
   |
   v
Sentinel
   |
   +----> ALLOW
   +----> REVIEW
   +----> BLOCK
```

Sentinel does not replace the agent. It evaluates whether the agent's
proposed action should proceed.

## 2. Problem

Autonomous agents are often given powerful tools with insufficient
runtime controls.

A traditional permission system can answer whether an agent can call
`send_email`, but not whether it can send a particular email to a
particular recipient containing particular data under a particular
policy.

Sentinel provides a context-sensitive decision layer.

## 3. Target Users

### AI application developers

Developers building agents that call APIs, access databases, manipulate
files, execute commands, send emails, make payments, or deploy
infrastructure.

### AI platform / infrastructure engineers

Teams operating multiple agents and needing centralized policies,
approval workflows, auditability, and runtime controls.

### Security engineers

Teams focused on agent authorization, prompt-injection resistance,
data-exfiltration prevention, and tool-abuse prevention.

## 4. Core User Story

> As an AI-agent developer, I want every potentially consequential agent
> action evaluated against my organization's policies before execution,
> so that unsafe or unauthorized actions can be blocked or routed to
> human review.

## 5. Product Principles

1.  **Default deny for consequential actions.**
2.  **Policies belong to the application.**
3.  **Deterministic logic stays deterministic.**
4.  **Evidence over assumptions.**
5.  **Human-in-the-loop for ambiguity.**

Laya is used for contextual judgments; exact checks remain normal
application logic.

## 6. MVP Scope

### Action interception

Accept agent action requests containing agent identity, task, tool,
arguments, and context.

### Policy engine

Allow users to define policies such as: - Customer data must never be
sent externally. - Production deletion requires human approval. -
Payments above \$100 require human approval. - Development
infrastructure may be modified automatically. - Credentials must never
be transmitted externally.

### Laya evaluation

Evaluate contextual questions such as: - Is sensitive information
exposed? - Does this action violate a supplied policy? - Does this
action require human approval? - Is the action destructive? - Does it
target production?

### Decision engine

Return: - `ALLOW` - `REVIEW` - `BLOCK`

### Approval queue

Allow humans to inspect and approve/reject review decisions.

### Audit log

Persist decision metadata, matched policies, judgments, and timestamps.

## 7. Dashboard

The dashboard must be minimal and modern.

Design direction: - neutral grayscale base - restrained accent colors -
compact typography - generous spacing - subtle borders - no gradients -
no glassmorphism - no decorative AI imagery - no excessive animation -
no purple gradients

The product should feel like serious developer/security infrastructure.

### Pages

-   Overview
-   Decisions
-   Decision Detail
-   Policies
-   Agents
-   Approvals
-   Settings

## 8. Non-Goals

Sentinel will not initially: - replace the underlying AI agent - execute
arbitrary agent actions itself - become a general-purpose SIEM - become
an endpoint security product - guarantee that an agent is safe - replace
authentication/authorization systems - invent organizational policies

## 9. Success Criteria

A developer can: 1. Register an agent. 2. Define policies. 3. Register
tools. 4. Submit an action. 5. Evaluate the action. 6. Receive ALLOW,
REVIEW, or BLOCK. 7. Execute only allowed actions. 8. Inspect the
complete decision. 9. Review blocked/reviewed actions. 10. Inspect
evidence and matched policies.

## 10. Hero Demo

Agent attempts to send customer data externally:

``` text
Agent
  |
send_email(customers.csv -> external@example.com)
  |
Sentinel
  |
Policy + deterministic checks + Laya
  |
BLOCK
```

Dashboard should clearly show why the action was blocked.

## 11. Roadmap

### V1

Runtime interception, Laya integration, policies, approval workflow,
audit logs, dashboard.

### V1.5

MCP integration, SDKs, policy testing, simulation, decision replay.

### V2

Agent identity, organization-wide policies, policy versioning, risk
scoring, multi-agent workflows.

### V3

Policy marketplace, advanced attack simulation, agent security
benchmarks, enterprise integrations.
